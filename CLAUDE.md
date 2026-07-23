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
- `core/simulation/port.ts` — `SimulationPort` is the seam where a real simulator (e.g. Falstad
  CircuitJS1 for visualization, ngspice-wasm for quantitative analysis) plugs in later. Keep the
  `Netlist` contract stable; don't bypass the port from UI code.

## Netlist model

Contacts sit at the four edge-midpoints of each cell. Adjacent cells share a boundary edge, so a
shared edge becomes a circuit node. `core/netlist/build.ts` assigns each block terminal to a
board-global edge key (after applying the block's orientation), then union-finds them via each
part's internal wiring groups. Orientation comes from the block's rotation; a part definition only
encodes the part type and its internal connectivity.
