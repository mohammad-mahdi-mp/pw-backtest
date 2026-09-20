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
| if-blocks (strategy) | see below |

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

## Limitations (for now)

Single-`plot`-per-statement, no `for` loops, no `var` state, `if` bodies may contain
strategy calls (not assignments), indicators don't have control flow. When you need more,
write the logic in Python against the same API.
