# pw-backtest

A native Fedora Linux desktop platform for strategy backtesting and bar/tick
replay — TradingView-grade charting, an event-driven Rust engine, and a
parity-verified port of the original Python reference semantics. No browser:
one system-installed app (Tauri v2 + Rust core + WebKitGTK).

> **Status:** Phase 0 of 9 (foundations). See `NATIVE_PLAN.md` (product spec)
> and `EXECUTION_PLAN.md` (AI-agent execution protocol + task graph).

## Repository layout

| Path | What it is |
|------|------------|
| `core/` | Rust workspace: `pw-core` (frozen domain types), `pw-engine` (broker/replay/backtest engine, parity-driven) |
| `reference/` | **Golden parity spec** — the original Python engine (broker, metrics, Pine, data, risk surfaces) kept solely to verify the Rust port 1:1. Not part of the shipped app. |
| `core/tests/fixtures/` | 50 golden broker fixtures generated from the reference (`reference/parity_export.py`) |
| `ui/` | (Phase 0/1) Tauri app shell + the new TradingView-grade UI — replaces the removed web frontend entirely |
| `docs/` | Native-app documentation (spikes, UI reference, engine semantics) |
| `scripts/` | Engineering gates (e.g. the parity expected-failure gate) |

## The parity law

The Python reference is the spec; the Rust engine must reproduce its event
sequences exactly (`1e-9`). Fixtures are regenerated only through
`python3 reference/parity_export.py` — never edited by hand. While the broker
port (P3-T01) is pending, `scripts/check-engine-expected-failures.sh` enforces
exactly 50 expected parity failures as the wired-harness gate.

## Development

Requires a Rust toolchain (stable, with clippy/rustfmt) and Node 22+ / pnpm.

```bash
cargo test -p pw-core --manifest-path core/Cargo.toml   # contract type tests
bash scripts/check-engine-expected-failures.sh          # parity harness gate
python3 reference/parity_export.py                      # regenerate golden fixtures
```

CI (GitHub Actions) runs clippy (strict), the pw-core contract tests, and the
parity gate on every push; Fedora 42/43 rpm builds land with the full P0-T04 CI.
