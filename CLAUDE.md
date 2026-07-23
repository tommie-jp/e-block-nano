# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser PoC (React + Vite + TypeScript, SVG rendering) for placing circuit "blocks" on a grid,
moving/rotating them, and building a netlist from the placement. Simulation runs behind a
swappable `SimulationPort` seam (currently a stub).

## Commands

```bash
npm run dev                     # dev server
npm test                        # vitest run (core unit tests)
npx vitest run src/core/grid    # run a single test dir/file
npm run lint                    # oxlint
npm run build                   # tsc -b && vite build
```

## Source layout (`src/`) — keep these boundaries

- `core/` — framework-free pure logic (grid/board ops, part catalog, netlist building,
  `SimulationPort`). React-free; this is what unit tests cover. Board operations are
  **immutable** (return a new Board, never mutate).
- `input/editor/` — the on-screen editor (a React hook) producing `Placement`s. New input
  sources should be sibling adapters that emit the same `Placement` type — don't leak editor
  concerns into `core/`.
- `render/` — SVG block glyphs.
- `ui/` — React components (palette, board view, app shell).
- `core/simulation/port.ts` — `SimulationPort` is the seam for a **batch/quantitative** engine
  (ngspice-wasm) later; still a stub. Keep the `Netlist` contract stable.
- `core/simulation/circuitjs/` — pure `Netlist → CircuitJS1` serializer (`serialize.ts`) and the
  `?cct=` embed-URL builder (`url.ts`). This is the **live-view** engine and deliberately does NOT
  go through `SimulationPort` (an iframe is a display, not a request/response call). Two engines,
  one shared `Netlist` contract + per-engine serializer. Format is verified against the real engine;
  the LED line must be `162 ... 0 cr cg cb mbc` (flags=0, no model name) or CircuitJS drops it.
- `ui/SimulatorPanel.tsx` embeds CircuitJS1 in an iframe (gated by lint errors). Engine base URL is
  `VITE_CIRCUITJS_BASE` (default self-hosted `/circuitjs/`, fetched via `npm run fetch:circuitjs`).
  `public/circuitjs/` is GPLv2, gitignored. Same-origin (default) uses the **JS-API live connection**
  (`ui/useCircuitJsLive.ts` + `io/circuitjsApi.ts`): the iframe loads once, netlist changes go through
  `importCircuit` (no reload), and `onupdate` telemetry maps element currents back to blocks via
  `serializeCircuitJs().blockIds` (getElements() returns elements in import line order — verified).
  Cross-origin bases fall back to `?cct=` URL reloads with no telemetry.

## Netlist model

Contacts sit at the four edge-midpoints of each cell. Adjacent cells share a boundary edge, so a
shared edge becomes a circuit node. `core/netlist/build.ts` assigns each block terminal to a
board-global edge key (after applying the block's orientation), then union-finds them via each
part's internal wiring groups. Orientation comes from the block's rotation; a part definition only
encodes the part type and its internal connectivity.

## Camera recognition (in scope; pipeline not yet implemented)

The end goal is recognizing a **physical** board from one photo: corner ArUco markers →
homography rectify → per-cell AprilTag decode → the same `Placement` list the editor produces.
The method is documented in [docs/recognition-pipeline.md](docs/recognition-pipeline.md) —
that document doubles as a defensive publication of the approach; keep it accurate and dated.

- `tools/paper-proto-gen/` — Python/OpenCV generator that renders synthetic top-down "photos"
  of a paper prototype from a board JSON file, plus ground-truth sidecars. Tags are drawn
  bit-exactly with `cv2.aruco` (never with generative image models). Its
  `tag_assignment.json` is the canonical part-ID ↔ tag-ID mapping shared with the future
  recognition implementation. Setup/usage in its own README; needs a local venv
  (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`).
