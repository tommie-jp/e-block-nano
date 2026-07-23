import { getPart } from '../parts/catalog'
import type { Direction } from '../parts/types'
import { rotateDirection } from '../parts/types'
import type { Board, Cell, Orientation } from '../grid/types'

/** ブロック端子 1 点 (どのブロックの、パーツ定義上どの端子か) */
export interface Terminal {
  readonly blockId: string
  /** パーツ定義上の方位 (向き 0 基準) */
  readonly terminal: Direction
}

/** 1 ネット = 電気的に導通している端子の集合 */
export interface Net {
  readonly nodeId: string
  readonly terminals: readonly Terminal[]
}

/**
 * セルの辺 (接点位置) を盤面全体で一意なキーにする。
 * 隣接セルは境界の辺を共有する → 同じキーになり、そこがノードになる (辺中央接点)。
 */
const edgeKey = (cell: Cell, dir: Direction): string => {
  switch (dir) {
    case 'N':
      return `H:${cell.row},${cell.col}`
    case 'S':
      return `H:${cell.row + 1},${cell.col}`
    case 'W':
      return `V:${cell.row},${cell.col}`
    case 'E':
      return `V:${cell.row},${cell.col + 1}`
  }
}

const boardEdgeKey = (
  cell: Cell,
  partDir: Direction,
  orientation: Orientation,
): string => edgeKey(cell, rotateDirection(partDir, orientation))

/** Union-Find (経路圧縮のみ)。ネット併合用 */
const createUnionFind = () => {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x)
    if (p === undefined || p === x) {
      parent.set(x, x)
      return x
    }
    const root = find(p)
    parent.set(x, root)
    return root
  }
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b))
  }
  return { find, union }
}

/**
 * 配置から導通ネットを構成する (netlist 骨格)。
 * 1. 各ブロックの端子を、向きを適用した盤面辺キーに割り当てる
 * 2. ブロック内部配線 (internalNets) で辺キー同士を併合する
 * 3. 同じ辺キーを共有する隣接ブロックは自動的に同ノードになる
 */
export const buildNets = (board: Board): Net[] => {
  const uf = createUnionFind()
  const terminalsByEdge = new Map<string, Terminal[]>()

  for (const p of board.placements) {
    const part = getPart(p.partId)
    for (const group of part.internalNets) {
      const keys = group.map((dir) => boardEdgeKey(p.cell, dir, p.orientation))
      keys.forEach((key, i) => {
        const list = terminalsByEdge.get(key) ?? []
        terminalsByEdge.set(key, [
          ...list,
          { blockId: p.blockId, terminal: group[i] },
        ])
        if (i > 0) uf.union(keys[0], key)
      })
    }
  }

  const netsByRoot = new Map<string, Terminal[]>()
  for (const [key, terminals] of terminalsByEdge) {
    const root = uf.find(key)
    netsByRoot.set(root, [...(netsByRoot.get(root) ?? []), ...terminals])
  }

  return [...netsByRoot.entries()].map(([nodeId, terminals]) => ({
    nodeId,
    terminals,
  }))
}
