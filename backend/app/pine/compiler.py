"""Pine Script compiler — minimal v5 subset for MVP.

Handles common form:
    //@version=5
    indicator("name", overlay=true/false)
    len = input.int(14)
    src = close
    r  = ta.rsi(src, len)
    m  = ta.sma(close, 20)
    plot(r)
    plot(m, color=color.blue)

Approach:
 1. Naive tokenizer (line/space based; Pine is line-oriented).
 2. Line-by-line transformer into a small IR that runtime.py executes with pandas.
This is intentionally lightweight; it will be iteratively expanded (Phase 4).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PineIR:
    version: int = 5
    name: str = "Untitled"
    overlay: bool = False
    shorttitle: str = ""
    inputs: list[dict] = field(default_factory=list)
    vars: list[dict] = field(default_factory=list)
    plots: list[dict] = field(default_factory=list)


_ASSIGN_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$")
_PLOT_RE = re.compile(r'^plot\s*\((.+)\)\s*$')
_INPUT_RE = re.compile(r"^input\.(int|float|bool|string|source|color)\s*\(([^)]*)\)\s*$")
_TA_RE = re.compile(r"ta\.([A-Za-z0-9_]+)\s*\(([^)]*)\)")


def _split_args(s: str) -> list[str]:
    args, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1; cur += ch
        elif ch == ")":
            depth -= 1; cur += ch
        elif ch == "," and depth == 0:
            args.append(cur.strip()); cur = ""
        else:
            cur += ch
    if cur.strip():
        args.append(cur.strip())
    return args


def _parse_kwarg(args: list[str]) -> tuple[list, dict]:
    pos, kw = [], {}
    for a in args:
        if "=" in a:
            k, v = a.split("=", 1)
            kw[k.strip()] = _parse_value(v.strip())
        else:
            pos.append(_parse_value(a))
    return pos, kw


def _parse_value(v: Any):
    if isinstance(v, str):
        v = v.strip()
        if v.startswith('"') and v.endswith('"'):
            return v[1:-1]
        if v.startswith("color."):
            return v
        if v in ("true", "false"):
            return v == "true"
        try:
            if "." in v:
                return float(v)
            return int(v)
        except ValueError:
            return v  # identifier / expression (kept as string)
    return v


def compile_pine(source: str) -> dict:
    ir = PineIR()
    lines = [ln.split("//")[0].strip() for ln in source.splitlines()]  # strip line comments
    for ln in lines:
        if not ln:
            continue
        if ln.startswith("//@version"):
            m = re.match(r"//@version=(\d+)", ln)
            if m:
                ir.version = int(m.group(1))
            continue
        if ln.startswith("indicator(") or ln.startswith("strategy("):
            inner = ln[ln.find("(")+1: ln.rfind(")")]
            args = _split_args(inner)
            pos, kw = _parse_kwarg(args)
            if pos:
                ir.name = str(pos[0])
            ir.shorttitle = str(kw.get("shorttitle", ir.name))
            ir.overlay = bool(kw.get("overlay", False))
            continue
        if ln.startswith("plot("):
            inner = ln[ln.find("(")+1: ln.rfind(")")]
            args = _split_args(inner)
            pos, kw = _parse_kwarg(args)
            ir.plots.append({
                "source": pos[0] if pos else "close",
                "title": kw.get("title", ""),
                "color": kw.get("color", "#2962FF"),
                "display": kw.get("display", None),
            })
            continue
        m_assign = _ASSIGN_RE.match(ln)
        if m_assign:
            name, expr = m_assign.group(1), m_assign.group(2).strip()
            # input.*
            m_input = _INPUT_RE.match(expr)
            if m_input:
                itype, inner = m_input.group(1), m_input.group(2)
                args = _split_args(inner)
                pos, kw = _parse_kwarg(args)
                ir.inputs.append({
                    "name": name,
                    "type": itype,
                    "default": pos[0] if pos else kw.get("defval", 0),
                    "title": kw.get("title", name),
                    "minval": kw.get("minval"),
                    "maxval": kw.get("maxval"),
                })
                continue
            # ta.* call
            m_ta = _TA_RE.match(expr)
            if m_ta:
                fn, inner = m_ta.group(1), m_ta.group(2)
                args = _split_args(inner)
                pos, kw = _parse_kwarg(args)
                ir.vars.append({
                    "name": name,
                    "expr": {"type": "ta", "fn": fn, "args": pos, "kwargs": kw},
                })
                continue
            # plain identifier / numeric literal
            ir.vars.append({"name": name, "expr": {"type": "ident", "value": _parse_value(expr)}})
            continue
    return {
        "version": ir.version,
        "name": ir.name,
        "shorttitle": ir.shorttitle,
        "overlay": ir.overlay,
        "inputs": ir.inputs,
        "vars": ir.vars,
        "plots": ir.plots,
    }
