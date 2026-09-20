# Pine Script Reference

The built-in editor speaks a practical subset of Pine Script v5. Anything it can't
compile produces a diagnostic in the editor console.

## Declarations

```pine
//@version=5
indicator("My Indicator", overlay=true)     // overlay=true draws on the price pane
strategy("My Strategy", overlay=true,
     initial_capital=100000,                // default 100000
     default_qty_type=strategy.percent_of_equity,
     default_qty_value=20)                  // % of equity (or fixed lots)
```

## Language features

| Feature | Example |
| --- | --- |
| assignments | `fast = ta.sma(close, 9)` |
| full expressions | `x = (a + b) / 2 > c and not d` |
| ternary | `col = close > open ? color.green : color.red` |
| comparisons | `> < >= <= == !=` |
| `input.*` | `len = input.int(14)` — editable in the legend |
| control flow | `if / else if / else`, `for i = a to b [by s]`, `var`, `:=` — indicators & strategies (see below) |
| history access | `close[1]`, `myvar[j]` — k bars back |

## ta.* functions

| Function | Notes |
| --- | --- |
| `ta.sma / ema / wma / rma(src, len)` | moving averages |
| `ta.rsi(src, len)` | RSI |
| `ta.macd(src, fast, slow, signal)` | returns 3 outputs — plot each (`plot(m.macd)`) |
| `ta.bb(src, len, mult)` | Bollinger — `plot(bb.upper)` etc. |
| `ta.atr(len)` | average true range |
| `ta.stoch(len)` | stochastic %K |
| `ta.highest / lowest(src, len)` | rolling extremes |
| `ta.vwap()` | session VWAP |
| `ta.change(src, len)` | delta |
| `ta.stdev(src, len)` | standard deviation |
| `ta.crossover / crossunder(a, b)` | series crossing — the workhorse of signals |

`math.abs/max/min/round/floor/ceil/sqrt/pow` and the `color.*` palette are available.

## Plotting

```pine
plot(fast, color=color.blue)
plot(slow, color=color.orange)
plot(ta.macd(close,12,26,9).hist)   // ".hist" suffix renders as a histogram pane
```

Titles default to the plotted expression — `plotTitle=` to customize.

## Strategy calls

```pine
//@version=5
strategy("SMA Cross", overlay=true,
     default_qty_type=strategy.percent_of_equity, default_qty_value=20)

fast = ta.sma(close, 9)
slow = ta.sma(close, 21)

if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)          // queues, fills next open

if ta.crossunder(fast, slow)
    strategy.close("Long")                         // exits next open

// attach / trail stops — evaluated every bar while a position is open
atr = ta.atr(14)
strategy.exit("X", stop = close - 2 * atr, limit = close + 4 * atr)
```

Also supported: `strategy.entry(..., qty=1)` (fixed lots), `strategy.close_all()`,
`strategy.cancel_all()`.

## Control flow (if / else / for / var)

Both indicators **and** strategies support block control flow with bar-by-bar state:

```pine
var trend = 0                    // persists across bars
if close > ta.sma(close, 20)
    trend := 1                   // := reassigns state
else if close < ta.sma(close, 40)
    trend := -1
else
    trend := 0

var heat = 0.0
heat := 0.0
for j = 0 to 4                   // inclusive range, optional `by step`
    heat := heat + (close[j] - open[j])   // close[k] = k bars back
```

- `if` / `else if` / `else` chains branch per bar; assignments inside blocks
  write per-bar state that later statements read at the same bar.
- Inside blocks, `ta.crossover` / `ta.crossunder` / `ta.change` work per-bar;
  other `ta.*` functions must be precomputed at top level (assign to a
  variable first) — the error message says exactly that.
- In **strategies**, `strategy.position_size` (signed: + long / − short / 0)
  is available in conditions, and `var` state carries across the whole run.

## Python strategies

For logic Pine can't express, write the strategy in plain Python — same broker
engine, same backtest panel. In the Pine editor open **Templates → Python —
Strategy**:

```python
class Strategy:
    def init(self, ctx):
        self.fast = ctx.sma("close", 10)
        self.slow = ctx.sma("close", 30)

    def on_bar(self, ctx):
        if ctx.i < 30:
            return
        if ctx.cross_over(self.fast, self.slow):
            ctx.buy(qty_pct=100, stop=ctx.close * 0.95, target=ctx.close * 1.10)
        elif ctx.cross_under(self.fast, self.slow):
            ctx.sell(qty_pct=100)
```

`ctx` exposes `i`, `open/high/low/close/volume`, `close_ago(k)`,
`sma/ema/rsi/atr/highest/lowest` (precomputed full lists), `cross_over` /
`cross_under`, `position_size`, `equity`, `buy` / `sell` (auto-reverse, with
optional `stop` / `target`), `close_position()` and `set_stop(price)` /
`set_target(price)` on the open position. Orders fill at the next bar's open —
identical semantics to Pine strategies.

## Remaining limitations

`plot()` only at top level, single-series plots per statement, no arrays/objects
(`array.*`, `map.*`), no `request.security()`. When you hit a wall, switch the
script to Python (above) — it runs on the same engine.
