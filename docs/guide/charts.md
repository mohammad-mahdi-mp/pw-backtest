# Charts & Drawings

## Chart types

Cycle from the top-bar chart menu: **Candles, Bars, Line, Area, Heikin Ashi**. Volume can be
toggled on/off in the same menu.

## Indicators

Press **Indicators** to add from the built-in library (SMA, EMA, WMA, RMA, Bollinger Bands,
MACD, RSI, ATR, Stochastic, VWAP…), or write your own in the **Pine Editor** and press
**Add to chart**. Overlays draw on the price pane; anything ending in a sub-pane series
(RSI, MACD…) gets its own synced pane. Remove an indicator with the ✕ on its legend chip.

## Drawings

The left toolbar is fully functional:

| Tool | How to use |
| --- | --- |
| Trend Line | click start, click end |
| Ray | click start, click direction — extends to the right edge |
| Horizontal Line | click a price |
| Rectangle | click two corners |
| Fib Retracement | click swing low & high — levels 0 / 0.236 / 0.382 / 0.5 / 0.618 / 0.786 / 1 |

- **Magnet** snaps anchor prices to the nearest OHLC of the bar under the cursor.
- Click a drawing to **select** it (highlighted), press <kbd>Del</kbd> to remove it,
  <kbd>Esc</kbd> cancels the active tool.
- Drawings are anchored to time & price — they survive panning, zooming and live updates,
  and extrapolate beyond the data edges.
- Every drawing is saved per **symbol + timeframe** in your browser and restored on reload.

## Multi-chart layouts

The layout button (top bar) switches between **1**, **2 side-by-side**, **2 stacked** and
**4** charts. Each pane has its own symbol, timeframe, chart type and indicators — the
pane with the blue border is *active*: the top bar, symbol search, screener and Pine
editor all target it. Click any pane (or <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd>) to
switch. The whole layout persists across reloads.

## Screener

**Screener** scans every symbol that has stored data on the current timeframe:
last price, 24h change, RSI(14), position vs SMA20/50/200, volume vs its 20-bar average
and position inside the 200-bar range. Sort any column; click a row to jump to that chart.

## Keyboard shortcuts

Open the **keyboard icon** (top bar) to view and rebind shortcuts — click a binding,
press the new combination, done. Defaults:

| Action | Keys |
| --- | --- |
| Replay play / pause | <kbd>Space</kbd> |
| Step forward / back | <kbd>→</kbd> / <kbd>←</kbd> |
| Close position | <kbd>X</kbd> |
| Next / previous chart pane | <kbd>Alt</kbd>+<kbd>→</kbd> / <kbd>Alt</kbd>+<kbd>←</kbd> |
| Toggle bottom panel | <kbd>Alt</kbd>+<kbd>B</kbd> |
| Toggle right sidebar | <kbd>Alt</kbd>+<kbd>S</kbd> |
