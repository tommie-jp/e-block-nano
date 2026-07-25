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

### Simulation — ngspice only

**ngspice (WASM) is the only engine.** CircuitJS1 was removed on 2026-07-25: its
"same pixel coordinate = same node" model cannot express a 3-post transistor, so every
transistor circuit was invisible in the live view, and each new `DeviceSpec` kind cost a
second serializer. Don't reintroduce a second engine without revisiting that.

- `core/simulation/port.ts` — `SimulationPort` is the **batch** seam (request → response):
  `.op` and `.tran`. Keep the `Netlist` contract stable.
- `core/simulation/streamPort.ts` — `ScopeStream` is the **continuous/live** seam, deliberately
  separate from `SimulationPort` (a running simulation is not a request/response call).
  Samples are `{ t, values: nodeId→V, currents: blockId→A }`.
- `core/simulation/spice/` — pure `Netlist → SPICE netlist` serializer plus result mapping.
  `currentProbes` is what lets a result vector come back as a `blockId` current; a device with
  no probe simply shows no current (transistors currently have none).
- `ui/scope/LiveScopePanel.tsx` — libngspice shared-mode streaming, drawn at 60fps from
  `ui/scope/liveBuffer.ts` (bounded ring buffer). Its `onLiveCurrents` feeds the board's
  per-block current display; `App` falls back to the `.op` currents when nothing is streaming.

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
