import { getPart } from '../parts/catalog'
import type { Direction, DeviceSpec } from '../parts/types'
import { devicePins, rotateDirection } from '../parts/types'
import type { Board, Cell, Orientation } from '../grid/types'

/** ブロック端子 1 点。terminal は方位 (ワイヤ) か素子ピンの役割名 */
export interface Terminal {
  readonly blockId: string
  readonly terminal: string
}

/** 1 ネット = 電気的に導通している端子の集合 */
export interface Net {
  readonly nodeId: string
  readonly terminals: readonly Terminal[]
}

/** 素子 1 個。各ピン (役割名) がどのノードに繋がるかを持つ */
export interface Element {
  readonly blockId: string
  readonly device: DeviceSpec
  /** ピン役割名 → nodeId */
  readonly pinNodes: Readonly<Record<string, string>>
}

/**
 * 配置から構成した回路。ネット (導通集合) と素子 (ノード間に挟まる部品) の両方を持つ。
 * カメラ認識も将来この Netlist を出力する。シミュレータはこの契約だけを受け取る。
 */
export interface Netlist {
  readonly nets: readonly Net[]
  readonly elements: readonly Element[]
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

/** 素子ピンの辺キー (nodeId 解決前の中間表現) */
interface PendingElement {
  readonly blockId: string
  readonly device: DeviceSpec
  readonly pinKeys: Readonly<Record<string, string>>
}

/**
 * 配置から Netlist を構成する。
 * 1. 各ブロック端子を、向きを適用した盤面辺キーに割り当てる
 * 2. ブロック内部配線 (internalNets) の同一グループ内だけ辺キーを併合する
 *    (素子ピンは併合しない → 両端が別ノードになりショートしない)
 * 3. 同じ辺キーを共有する隣接ブロックは自動的に同ノードになる
 * 4. 素子ピンの辺キーを最終ノードへ解決して element に載せる
 */
export const buildNetlist = (board: Board): Netlist => {
  const uf = createUnionFind()
  const terminalsByEdge = new Map<string, Terminal[]>()
  const pending: PendingElement[] = []

  const addTerminal = (key: string, terminal: Terminal): void => {
    terminalsByEdge.set(key, [...(terminalsByEdge.get(key) ?? []), terminal])
  }

  for (const p of board.placements) {
    const part = getPart(p.partId)

    // 内部配線: グループ内で辺キーを併合
    for (const group of part.internalNets) {
      const keys = group.map((dir) => boardEdgeKey(p.cell, dir, p.orientation))
      keys.forEach((key, i) => {
        addTerminal(key, { blockId: p.blockId, terminal: group[i] })
        if (i > 0) uf.union(keys[0], key)
      })
    }

    // 素子ピン: 各ピンを辺キーに割り当てるが併合はしない
    if (part.device) {
      const pinKeys: Record<string, string> = {}
      for (const [role, dir] of devicePins(part.device)) {
        const key = boardEdgeKey(p.cell, dir, p.orientation)
        addTerminal(key, { blockId: p.blockId, terminal: role })
        pinKeys[role] = key
      }
      pending.push({ blockId: p.blockId, device: part.device, pinKeys })
    }
  }

  const netsByRoot = new Map<string, Terminal[]>()
  for (const [key, terminals] of terminalsByEdge) {
    const root = uf.find(key)
    netsByRoot.set(root, [...(netsByRoot.get(root) ?? []), ...terminals])
  }
  const nets: Net[] = [...netsByRoot.entries()].map(([nodeId, terminals]) => ({
    nodeId,
    terminals,
  }))

  const elements: Element[] = pending.map((e) => ({
    blockId: e.blockId,
    device: e.device,
    pinNodes: Object.fromEntries(
      Object.entries(e.pinKeys).map(([role, key]) => [role, uf.find(key)]),
    ),
  }))

  return { nets, elements }
}
