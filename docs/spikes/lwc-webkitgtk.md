# Spike A — Lightweight Charts v5 on WebKitGTK (P0-T05 decision gate)

**Question.** Can TradingView's Lightweight Charts **v5** sustain
chart-grade pan/zoom (target ≥ 45 fps) inside Tauri v2's WebKitGTK webview —
the weakest of the major webviews for canvas-heavy UIs (NATIVE_PLAN §11
risk R-UI-1)?

**Deliverable.** A throwaway measurement harness
(`spikes/lwc-webkitgtk/`) + this decision record. The product decision it
feeds: the Phase-1 chart core renderer (P1-T07).

## Method

- 100 000 seeded candles (mulberry32 seed `20260921`, 1-minute spacing) +
  volume histogram on a second LWC pane — the §8 budget workload.
- Scripted phases: 2 s warmup → **pan** (visible logical range advances
  17 bars/frame, wrapping) → **zoom** (range width ×0.97 per frame,
  clamped 60…20 000 bars) → report.
- Timing: `requestAnimationFrame` deltas; fps per phase =
  frames ÷ active-phase wall time. Memory: host-process `VmRSS` via
  `/proc/self/status`, sampled 1 Hz from the webview through the
  `spike_stats` command.
- CI runs headless under Xvfb with `WEBKIT_DISABLE_DMABUF_RENDERER=1`
  — **software rendering (llvmpipe)**, so CI numbers are a *lower bound /
  consistency check*, never the acceptance number.

## Results

| Environment | Renderer | fps (pan) | fps (zoom) | RSS (MiB) | Verdict |
|---|---|---|---|---|---|
| CI `ubuntu-latest`, Xvfb, Tauri/WebKitGTK (run 35593975741) | llvmpipe (software) | **62.2 fps** | **62.2 fps** | ~148 MiB | sanity ✓ (above the 45 fps bar even software-rendered) |
| **Owner Fedora 43 hardware** (authoritative) | GPU/WebGL | **PENDING — run `scripts/spike-run.sh`** | — | — | decides GO/NO-GO |

## Decision rule (from the card)

- **GO** — owner hardware sustains ≥ 45 fps pan/zoom on 100k bars with LWC v5.
- **NO-GO** — below 45 fps on owner hardware → default mitigation per plan:
  custom-canvas price pane for P1-T07 (LWC kept only if a hybrid still wins).

Mitigation ladder if NO-GO (in order):
1. `WEBKIT_DISABLE_DMABUF_RENDERER=0`/HW-accel env tuning + driver check.
2. Reduce DPR antialiasing; disable LWC crosshair shadows/anim options.
3. Data-window thinning before `setData` (already the P1-T07 plan for >100k).
4. **Custom canvas price pane** (plan default), LWC retained for axes/scales.

## CI sanity result (run 35593975741)

100 000 candles + volume pane, 12 s per phase, Xvfb 1280×800, `WEBKIT_DISABLE_DMABUF_RENDERER=1`
(llvmpipe software rendering): **fps pan 62.2 · fps zoom 62.2 · RSS ~148 MiB** — vsync-capped and
already above the 45 fps GO threshold *without any GPU*. This makes a NO-GO on owner hardware
very unlikely; the owner run remains the formal gate.

## Status

- Harness: **delivered** (this commit) — CI job `spike` runs it headless and
  attaches `spike-report.json` as an artifact.
- **Decision: PENDING owner hardware run** — CI numbers do not satisfy the
  card's GO threshold on their own (software rendering). Owner: run
  `bash scripts/spike-run.sh` on the Fedora 43 machine and paste the printed
  JSON; the table + verdict get updated in this file and P1-T07 proceeds
  accordingly. Provisional planning assumption until then: **GO for LWC v5**.
