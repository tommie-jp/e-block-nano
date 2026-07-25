import { getPart } from '../parts/catalog'
import type { Direction, DeviceSpec } from '../parts/types'
import { devicePins, rotateDirection } from '../parts/types'
import type {
  Board,
  Cell,
  Orientation,
  PlacementState,
} from '../grid/types'
import { edgeKey } from './edgeKey'

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
  /**
   * 配置インスタンス状態 (スイッチ開閉など)。省略時はデバイス既定
   * (スイッチは開)。シミュレータ / circuit lint が解釈する。
   */
  readonly state?: PlacementState
}

/**
 * 配置から構成した回路。ネット (導通集合) と素子 (ノード間に挟まる部品) の両方を持つ。
 * カメラ認識も将来この Netlist を出力する。シミュレータはこの契約だけを受け取る。
 */
export interface Netlist {
  readonly nets: readonly Net[]
  readonly elements: readonly Element[]
  /**
   * 辺キー (接点位置) → その辺が属する nodeId。ブロックが触れている辺だけを持つ。
   * ネットの代表以外の辺も引けるので、盤面座標 → ノードの逆引き (プローブの
   * ヒットテスト) に使える。`nets` から復元しようとすると build の内部配線処理を
   * UI 側で再実装することになるため、ここで公開する。
   */
  readonly nodeOfEdge: Readonly<Record<string, string>>
  /**
   * 基準ノード (SPICE の node 0)。最初の電池のマイナス端子ノードを 0V とする規約。
   * 電池が無ければ null (シミュレーション不能。将来の circuit lint が検出する)。
   */
  readonly groundNode: string | null
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
  readonly state?: PlacementState
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
      pending.push({
        blockId: p.blockId,
        device: part.device,
        pinKeys,
        state: p.state,
      })
    }
  }

  const netsByRoot = new Map<string, Terminal[]>()
  const nodeOfEdge: Record<string, string> = {}
  for (const [key, terminals] of terminalsByEdge) {
    const root = uf.find(key)
    netsByRoot.set(root, [...(netsByRoot.get(root) ?? []), ...terminals])
    nodeOfEdge[key] = root
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
    ...(e.state ? { state: e.state } : {}),
  }))

  // 最初の電池のマイナス端子を基準ノード (0V) とする
  const battery = elements.find((e) => e.device.kind === 'battery')
  const groundNode = battery ? battery.pinNodes.minus : null

  return { nets, elements, nodeOfEdge, groundNode }
}
