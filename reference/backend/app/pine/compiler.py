"""Pine Script compiler — v5 subset.

Supports:
- indicator()/strategy() declarations with kwargs (overlay, initial_capital,
  default_qty_type, default_qty_value)
- assignments with full expressions (arithmetic, comparisons, and/or/not,
  ternary) via a small recursive-descent parser
- input.* declarations
- plot() with title/color
- if-blocks (indented bodies containing strategy.* calls)
- top-level strategy.entry/close/close_all/exit/cancel_all calls
- ta.crossover/crossunder and the indicator set from the runtime

Emits an ordered statement list; series are evaluated vectorized by the
runtime, strategy calls are replayed bar-by-bar by the strategy executor.
"""
from __future__ import annotations

import re
from typing import Any, Optional

# ---------------------------------------------------------------- tokenizer

_TOKEN_RE = re.compile(
    r"""
      (?P<WS>\s+)
    | (?P<NUM>\d+\.\d+|\.\d+|\d+)
    | (?P<STR>"[^"]*")
    | (?P<ID>[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)
    | (?P<OP>>=|<=|==|!=|:=|\?|:|>|<|\+|-|\*|/|\(|\)|,|=|\[|\])
    """,
    re.VERBOSE,
)


def tokenize(s: str) -> list[dict]:
    toks: list[dict] = []
    pos = 0
    while pos < len(s):
        m = _TOKEN_RE.match(s, pos)
        if not m:
            raise SyntaxError(f"Unexpected character {s[pos]!r} in: {s[:60]}")
        pos = m.end()
        if m.lastgroup != "WS":
            toks.append({"k": m.lastgroup, "v": m.group()})
    return toks


class _Parser:
    """Recursive-descent expression parser producing a JSON-able AST."""

    def __init__(self, toks: list[dict]):
        self.toks = toks
        self.i = 0

    def peek(self) -> Optional[dict]:
        return self.toks[self.i] if self.i < len(self.toks) else None

    def next(self) -> Optional[dict]:
        t = self.peek()
        if t:
            self.i += 1
        return t

    def expect(self, v: str) -> dict:
        t = self.next()
        if not t or t["v"] != v:
            got = t["v"] if t else "end of expression"
            raise SyntaxError(f"Expected {v!r}, got {got!r}")
        return t

    # precedence chain
    def parse_expr(self):
        return self.parse_ternary()

    def parse_ternary(self):
        cond = self.parse_or()
        if self.peek() and self.peek()["v"] == "?":
            self.next()
            a = self.parse_or()
            self.expect(":")
            b = self.parse_ternary()
            return {"t": "ternary", "c": cond, "a": a, "b": b}
        return cond

    def parse_or(self):
        l = self.parse_and()
        while self.peek() and self.peek()["v"] == "or":
            self.next()
            r = self.parse_and()
            l = {"t": "bin", "op": "or", "l": l, "r": r}
        return l

    def parse_and(self):
        l = self.parse_not()
        while self.peek() and self.peek()["v"] == "and":
            self.next()
            r = self.parse_not()
            l = {"t": "bin", "op": "and", "l": l, "r": r}
        return l

    def parse_not(self):
        if self.peek() and self.peek()["v"] == "not":
            self.next()
            return {"t": "un", "op": "not", "x": self.parse_not()}
        return self.parse_cmp()

    def parse_cmp(self):
        l = self.parse_add()
        p = self.peek()
        if p and p["v"] in (">", "<", ">=", "<=", "==", "!="):
            op = self.next()["v"]
            r = self.parse_add()
            return {"t": "bin", "op": op, "l": l, "r": r}
        return l

    def parse_add(self):
        l = self.parse_mul()
        while self.peek() and self.peek()["v"] in ("+", "-"):
            op = self.next()["v"]
            r = self.parse_mul()
            l = {"t": "bin", "op": op, "l": l, "r": r}
        return l

    def parse_mul(self):
        l = self.parse_unary()
        while self.peek() and self.peek()["v"] in ("*", "/"):
            op = self.next()["v"]
            r = self.parse_unary()
            l = {"t": "bin", "op": op, "l": l, "r": r}
        return l

    def parse_unary(self):
        if self.peek() and self.peek()["v"] == "-":
            self.next()
            return {"t": "un", "op": "-", "x": self.parse_unary()}
        return self.parse_atom()

    def parse_atom(self):
        t = self.next()
        if not t:
            raise SyntaxError("Unexpected end of expression")
        if t["k"] == "NUM":
            node: dict = {"t": "num", "v": float(t["v"])}
        elif t["k"] == "STR":
            node = {"t": "str", "v": t["v"][1:-1]}
        elif t["k"] == "ID":
            if self.peek() and self.peek()["v"] == "(":
                self.next()
                args, kwargs = self.parse_call_args()
                node = {"t": "call", "fn": t["v"], "args": args, "kwargs": kwargs}
            else:
                node = {"t": "id", "v": t["v"]}
        elif t["v"] == "(":
            e = self.parse_expr()
            self.expect(")")
            node = e
        else:
            raise SyntaxError(f"Unexpected token {t['v']!r}")
        # history access: close[1], myvar[j]
        while self.peek() and self.peek()["v"] == "[":
            self.next()
            k = self.parse_expr()
            self.expect("]")
            node = {"t": "hist", "x": node, "k": k}
        return node

    def parse_call_args(self):
        args: list[dict] = []
        kwargs: dict[str, dict] = {}
        if self.peek() and self.peek()["v"] == ")":
            self.next()
            return args, kwargs
        while True:
            # kwarg?  ID = expr
            if (
                self.peek()
                and self.peek()["k"] == "ID"
                and self.i + 1 < len(self.toks)
                and self.toks[self.i + 1]["v"] == "="
            ):
                name = self.next()["v"]
                self.next()  # '='
                kwargs[name] = self.parse_expr()
            else:
                args.append(self.parse_expr())
            t = self.next()
            if not t or t["v"] == ")":
                break
            if t["v"] != ",":
                raise SyntaxError(f"Expected ',' or ')' in call args, got {t['v']!r}")
        return args, kwargs


def parse_expr_src(src: str) -> dict:
    p = _Parser(tokenize(src))
    ast = p.parse_expr()
    if p.peek():
        raise SyntaxError(f"Trailing tokens in expression: {src[:60]}")
    return ast


# ---------------------------------------------------------------- helpers


def _strip_comment(line: str) -> str:
    in_str = False
    for i, ch in enumerate(line):
        if ch == '"':
            in_str = not in_str
        elif ch == "/" and not in_str and i + 1 < len(line) and line[i + 1] == "/":
            return line[:i]
    return line


def _logical_lines(source: str) -> list[dict]:
    out = []
    for no, raw in enumerate(source.splitlines(), 1):
        text = _strip_comment(raw)
        if not text.strip():
            continue
        expanded = text.replace("\t", "    ")
        indent = len(expanded) - len(expanded.lstrip(" "))
        out.append({"text": expanded.strip(), "indent": indent, "no": no})
    return out


def _lit(toks: list[dict]) -> Any:
    """Parse a literal value from a call kwarg (num/str/bool/id)."""
    if not toks:
        return None
    t = toks[0]
    if t["k"] == "NUM":
        return float(t["v"])
    if t["k"] == "STR":
        return t["v"][1:-1]
    if t["k"] == "ID":
        v = t["v"]
        if v == "true":
            return True
        if v == "false":
            return False
        if v.startswith("strategy."):
            return v[len("strategy."):]
        return v
    return None


def _parse_decl(inner: str, ir: dict) -> None:
    toks = tokenize(inner)
    p = _Parser(toks)
    args, kwargs = p.parse_call_args()
    if args and args[0]["t"] == "str":
        ir["name"] = args[0]["v"]
    def kv(name: str, default: Any) -> Any:
        if name in kwargs:
            # literal-ish: reparse from AST
            a = kwargs[name]
            if a["t"] in ("num", "str"):
                return a["v"]
            if a["t"] == "id":
                v = a["v"]
                if v == "true":
                    return True
                if v == "false":
                    return False
                if v.startswith("strategy."):
                    return v[len("strategy."):]
                return v
        return default
    ir["shorttitle"] = str(kv("shorttitle", ir["name"]))
    ir["overlay"] = bool(kv("overlay", False))
    p_ = ir["params"]
    p_["initial_capital"] = float(kv("initial_capital", p_["initial_capital"]))
    qty_type = kv("default_qty_type", p_["default_qty_type"])
    p_["default_qty_type"] = str(qty_type).replace("strategy.", "")
    p_["default_qty_value"] = float(kv("default_qty_value", p_["default_qty_value"]))
    p_["pyramiding"] = int(kv("pyramiding", p_["pyramiding"]))


def _parse_input(name: str, inner: str, ir: dict) -> None:
    p = _Parser(tokenize(inner))
    args, kwargs = p.parse_call_args()
    itype = "float"
    default: Any = 0
    if args:
        a = args[0]
        if a["t"] == "num":
            default = a["v"]
        elif a["t"] == "str":
            default = a["v"]
        elif a["t"] == "id" and a["v"] in ("true", "false"):
            default = a["v"] == "true"
    if "defval" in kwargs:
        a = kwargs["defval"]
        if a["t"] == "num":
            default = a["v"]
        elif a["t"] == "str":
            default = a["v"]
    m = re.match(r"input\.(\w+)", inner)
    if m:
        itype = m.group(1)
    ir["inputs"].append({
        "name": name,
        "type": itype,
        "default": default,
        "title": kwargs.get("title", ({"t": "str", "v": name})),
    })


_STRATEGY_ACTIONS = {"entry", "close", "close_all", "exit", "cancel", "cancel_all"}


def _parse_strategy_call(txt: str, line_no: int) -> dict:
    m = re.match(r"^strategy\.([a-z_]+)\s*\((.*)\)$", txt)
    if not m:
        raise SyntaxError(f"Malformed strategy call at line {line_no}: {txt[:60]}")
    action = m.group(1)
    if action not in _STRATEGY_ACTIONS:
        raise SyntaxError(f"Unsupported strategy.{action}() at line {line_no}")
    p = _Parser(tokenize(m.group(2)))
    args, kwargs = p.parse_call_args()
    return {"kind": "strategy_call", "action": action, "args": args, "kwargs": kwargs, "line": line_no}


# ---------------------------------------------------------------- compiler

_VAR_RE = re.compile(
    r"^var\s+(?:(?:int|float|bool|string|color|simple|const|series)\s+)*([A-Za-z_]\w*)\s*=\s*(.+)$"
)
_FOR_RE = re.compile(r"^for\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s+to\s+(.+?)(?:\s+by\s+(.+))?$")
_TYPE_KWS = ("int", "float", "bool", "string", "color", "line", "label", "box", "table")
_IR_CTX: dict = {"ir": None}


def _parse_body(lines: list[dict], i: int, ind: int) -> tuple[list[dict], int]:
    """Parse an indented block (all consecutive lines with indent > ind) into statements."""
    stmts: list[dict] = []
    while i < len(lines) and lines[i]["indent"] > ind:
        st, i = _parse_stmt(lines, i, lines[i]["indent"], in_block=True)
        if st:
            stmts.append(st)
    return stmts, i


def _parse_if(lines: list[dict], i: int, ind: int, cond_src: str) -> tuple[dict, int]:
    cond = parse_expr_src(cond_src)
    body, j = _parse_body(lines, i + 1, ind)
    node: dict = {"kind": "if", "cond": cond, "body": body, "elifs": [], "else_body": [], "line": lines[i]["no"]}
    while j < len(lines) and lines[j]["indent"] == ind and lines[j]["text"].startswith("else"):
        t = lines[j]["text"]
        if t == "else":
            node["else_body"], j = _parse_body(lines, j + 1, ind)
            break
        m = re.match(r"^else\s+if\s+(.+)$", t) or re.match(r"^elseif\s+(.+)$", t)
        if not m:
            raise SyntaxError(f"Malformed else clause at line {lines[j]['no']}: {t[:60]}")
        c2 = parse_expr_src(m.group(1))
        b2, j = _parse_body(lines, j + 1, ind)
        node["elifs"].append({"cond": c2, "body": b2})
    return node, j


def _parse_stmt(lines: list[dict], i: int, ind: int, in_block: bool = False) -> tuple[Optional[dict], int]:
    """Parse one statement at lines[i]. Returns (stmt|None, next_i)."""
    L = lines[i]
    txt = L["text"]
    ir = _IR_CTX["ir"]

    m_decl = re.match(r"^(indicator|strategy)\s*\((.*)\)$", txt)
    if m_decl:
        if in_block:
            raise SyntaxError(f"Declaration must be at top level, line {L['no']}")
        ir["kind"] = m_decl.group(1)
        _parse_decl(m_decl.group(2), ir)
        return None, i + 1

    if txt.startswith("plot(") and txt.endswith(")"):
        if in_block:
            raise SyntaxError(f"plot() only allowed at top level, line {L['no']}")
        p = _Parser(tokenize(txt[5:-1]))
        args, kwargs = p.parse_call_args()
        src_ast = args[0] if args else {"t": "id", "v": "close"}
        title = ""
        if "title" in kwargs and kwargs["title"]["t"] == "str":
            title = kwargs["title"]["v"]
        color = "#2962FF"
        if "color" in kwargs and kwargs["color"]["t"] == "id":
            color = kwargs["color"]["v"]
        elif "color" in kwargs and kwargs["color"]["t"] == "str":
            color = kwargs["color"]["v"]
        return (
            {"kind": "plot", "expr": src_ast, "title": title, "color": color,
             "src": txt[5:-1].split(",")[0].strip(), "line": L["no"]},
            i + 1,
        )

    # if / else-if / else
    if txt == "if" or txt.startswith("if ") or txt.startswith("if("):
        cond_src = (txt[2:].strip() if txt.startswith("if(") else txt[3:].strip()).strip()
        if cond_src.startswith("(") and cond_src.endswith(")"):
            cond_src = cond_src[1:-1]
        if not cond_src:
            raise SyntaxError(f"Missing condition after 'if' at line {L['no']}")
        return _parse_if(lines, i, ind, cond_src)

    # for i = a to b [by c]
    m_for = _FOR_RE.match(txt)
    if m_for:
        node = {
            "kind": "for",
            "var": m_for.group(1),
            "from": parse_expr_src(m_for.group(2)),
            "to": parse_expr_src(m_for.group(3)),
            "by": parse_expr_src(m_for.group(4)) if m_for.group(4) else None,
            "body": [],
            "line": L["no"],
        }
        node["body"], j = _parse_body(lines, i + 1, ind)
        if not node["body"]:
            raise SyntaxError(f"Empty for-block at line {L['no']}")
        return node, j

    # var x = init
    m_var = _VAR_RE.match(txt)
    if m_var:
        if in_block:
            raise SyntaxError(f"var declaration must be at top level, line {L['no']}")
        return (
            {"kind": "var_decl", "name": m_var.group(1),
             "expr": parse_expr_src(m_var.group(2)), "line": L["no"]},
            i + 1,
        )

    if txt in ("break", "continue"):
        return ({"kind": txt, "line": L["no"]}, i + 1)

    if txt.startswith("strategy."):
        return (_parse_strategy_call(txt, L["no"]), i + 1)

    # reassignment x := expr
    m_reassign = re.match(r"^([A-Za-z_]\w*)\s*:=\s*(.+)$", txt)
    if m_reassign:
        return (
            {"kind": "assign", "name": m_reassign.group(1),
             "expr": parse_expr_src(m_reassign.group(2)), "reassign": True, "line": L["no"]},
            i + 1,
        )

    # typed declaration: float x = ... / int x = ...
    m_typed = re.match(rf"^({'|'.join(_TYPE_KWS)})\s+([A-Za-z_]\w*)\s*=\s*(.+)$", txt)
    if m_typed and not in_block:
        return (
            {"kind": "assign", "name": m_typed.group(2),
             "expr": parse_expr_src(m_typed.group(3)), "line": L["no"]},
            i + 1,
        )

    # plain assignment x = expr
    m_assign = re.match(r"^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$", txt)
    if m_assign:
        name, rhs = m_assign.group(1), m_assign.group(2).strip()
        if rhs.startswith("input.") and rhs.endswith(")") and not in_block:
            _parse_input(name, rhs[rhs.find("(") + 1: -1], ir)
            return (
                {"kind": "assign", "name": name,
                 "expr": parse_expr_src(str(ir["inputs"][-1]["default"])), "line": L["no"]},
                i + 1,
            )
        return (
            {"kind": "assign", "name": name, "expr": parse_expr_src(rhs), "line": L["no"]},
            i + 1,
        )

    # unknown statement — skip gracefully
    return None, i + 1


def compile_pine(source: str) -> dict:
    version_m = re.search(r"//@version=(\d+)", source)
    ir: dict[str, Any] = {
        "version": int(version_m.group(1)) if version_m else 5,
        "kind": "indicator",
        "name": "Untitled",
        "shorttitle": "",
        "overlay": False,
        "params": {
            "initial_capital": 100_000.0,
            "default_qty_type": "percent_of_equity",
            "default_qty_value": 10.0,
            "pyramiding": 0,
        },
        "inputs": [],
        "statements": [],
        "plots": [],
    }

    lines = _logical_lines(source)
    _IR_CTX["ir"] = ir
    i = 0
    while i < len(lines):
        st, i = _parse_stmt(lines, i, lines[i]["indent"], in_block=False)
        if st:
            ir["statements"].append(st)
            if st["kind"] == "plot":
                ir["plots"].append({"title": st["title"], "color": st["color"]})

    # second pass: precompute which names are control-flow "state" variables
    state: set[str] = set()
    for st in ir["statements"]:
        if st.get("kind") == "var_decl":
            state.add(st["name"])
        elif st.get("kind") == "assign" and st.get("reassign"):
            state.add(st["name"])

    def _collect_writes(stmts: list[dict], in_body: bool = False) -> None:
        for s in stmts:
            k = s.get("kind")
            if k == "assign" and in_body:
                state.add(s["name"])
            elif k == "if":
                _collect_writes(s["body"], True)
                for e in s.get("elifs", []):
                    _collect_writes(e["body"], True)
                _collect_writes(s.get("else_body", []) or [], True)
            elif k == "for":
                state.discard(s["var"])  # loop counter — scoped, not persistent state
                _collect_writes(s["body"], True)

    _collect_writes(ir["statements"])
    ir["state_vars"] = sorted(state)
    return ir
