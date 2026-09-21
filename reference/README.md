# reference/ — golden parity spec (NOT part of the product)

This directory preserves the **original Python engine** of pw-backtest after
the web-era application (FastAPI + React frontend) was removed from the
repository. It exists for exactly one purpose: the Rust engine
(`core/pw-engine`) must reproduce its semantics **1:1**, verified by the
golden fixtures in `core/tests/fixtures/`.

Nothing here is compiled into the app, shipped in the RPM, or reachable from
the UI. Do not add product features here. Do not edit these files to change
engine behavior — behavior changes to the product go through the Rust engine
and (only via the fixture pipeline) through this reference.

## Layout

| Path (relative to `reference/`) | Role | Cited by |
|------|------|----------|
| `backend/app/replay/engine.py` | VirtualBroker — fills, spread/slippage, pending triggers, SL/TP, netting/reduce/flip, margin | P3-T01 (the spec) |
| `backend/app/replay/markets.py` | Market classification + cost model defaults | P2-T01 |
| `backend/app/backtest/metrics.py` | Metric definitions (Sharpe, Sortino, CAGR, MaxDD, PF, …) | P4-T02 |
| `backend/app/pine/*` | Pine compiler/runtime/strategy (incl. `stdlib/`) | P5 |
| `backend/app/data/*` | CSV importer, providers, storage/downloader semantics | P2 |
| `backend/app/paper/feed.py` | Paper-trading feed semantics | P8-T02 |
| `backend/app/brokers/*` | OANDA/IBKR router semantics | P8-T05/T06 |
| `backend/app/models/{order,trade}.py` | Column layout the §1.5 `orders`/`trades` tables must stay parity-compatible with (doc-only; needs the removed SQLAlchemy base to run) | §1.5 |
| `backend/app/core/config.py` | Settings shape (doc-only) | — |
| `backend/algorithms_reference.py` | Grid + walk-forward optimizer, extracted verbatim from the removed `app/api/backtest.py` (only deviation: `ValueError` instead of `HTTPException`) | P4-T05 |
| `backend/tests/test_replay_engine.py` | The 11 broker spec tests | P3 |
| `backend/tests/test_pine_strategy.py` | The 6 Pine corpus-seed tests | P5 |
| `backend/tests/test_optimize.py` | Grid/WF/MAE-MFE behavior pins (imports adapted to `algorithms_reference`) | P4 |
| `parity_export.py` | Generates the 50 golden broker fixtures from the reference broker | P0-T02 |

## Running

The broker reference (`replay/`) is stdlib-only:

```bash
python3 reference/backend/tests/test_replay_engine.py   # 11/11 must pass
python3 reference/parity_export.py                      # regenerate fixtures
```

Everything else needs a small venv (see `backend/requirements.txt`):
`pandas`, `numpy`, `pydantic-settings`. The Pine parity corpus (P5-T08) runs
this reference in a CI container.
