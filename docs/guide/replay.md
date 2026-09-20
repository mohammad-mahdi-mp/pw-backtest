# Bar Replay

Replay hides the future and lets you trade it candle-by-candle — the core practice loop.

## Starting a session

Press **Replay** in the top bar. A session is created on the *active chart pane's* symbol
and timeframe, with the cursor set ~300 bars back and $100,000 of simulated capital.

## Controls

- **Space** — play / pause
- **→ / ←** — step one bar, **⇧**-buttons on the floating bar jump 50 bars
- Speed selector: 0.5× to 50×
- **X** — close the open position at market
- Exit (✕) ends the session

## Placing orders

The **Trade** tab holds the order ticket:

- **Market** orders fill immediately at the last close ± spread/slippage.
- **Limit / Stop** orders rest until price trades through them on a later bar.
- Optional **SL / TP** are attached to the entry and trigger automatically — SL is
  evaluated first when both are hit inside the same bar.

The broker is a full netting simulation: adding to a position averages the entry,
reducing books realized P&L, and an opposite order flips the position. Commissions are
charged per side (per lot for FX, percent for crypto).

Entry, SL, TP and pending-order lines are drawn on the chart, with fill/close markers and
running P&L in the Trade and Account tabs. Every trade can carry a journal note.
