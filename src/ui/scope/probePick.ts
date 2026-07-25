import { blockAt } from '../../core/grid/board'
import type { Board } from '../../core/grid/types'
import { isInside } from '../../core/grid/types'
import type { Netlist } from '../../core/netlist/build'
import { CELL_SIZE } from '../../render/constants'
import { probePoint } from '../waveProbes'

/**
 * ボード上のプローブ当て (LTspice の回路図プローブ相当)。
 * 接点 (辺の中点) に当てれば電圧プローブ、素子の胴体に当てれば電流クランプ。
 * 接点 → 接点のドラッグは差動電圧 (V(a)−V(b))。
 *
 * 配線の電流は本アプリでは測れない (ノードは辺キー、電流は素子単位でしか
 * 定義されない) ので、LTspice の Alt+クリック(配線電流)は対応しない。
 */

/** 接点とみなす距離 [px] (SVG viewBox 座標)。指でも押せる程度に大きめ */
export const CONTACT_HIT_RADIUS = 16

export interface Point {
  readonly x: number
  readonly y: number
}

export type ProbePick =
  /** `edge` は当てた接点そのもの (nodeId は併合後の代表なので位置が別のことがある) */
  | { readonly kind: 'node'; readonly nodeId: string; readonly edge: string }
  | { readonly kind: 'current'; readonly blockId: string }

/** 盤面座標に一番近い接点 (ヒット半径内) を返す。無ければ null */
const nearestContact = (
  netlist: Netlist,
  pt: Point,
): { nodeId: string; edge: string } | null => {
  let best: { nodeId: string; edge: string; d2: number } | null = null
  for (const [edge, nodeId] of Object.entries(netlist.nodeOfEdge)) {
    const p = probePoint(edge)
    if (!p) continue
    const d2 = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2
    if (!best || d2 < best.d2) best = { nodeId, edge, d2 }
  }
  if (!best || best.d2 > CONTACT_HIT_RADIUS ** 2) return null
  return { nodeId: best.nodeId, edge: best.edge }
}

/**
 * 盤面座標 (SVG viewBox) から測定対象を決める純関数。
 * 接点が優先 (素子セルの内側でも接点近傍なら電圧)。素子でないブロック
 * (ワイヤ) や空セルは測るものが無いので null。
 */
export const pickProbe = (
  board: Board,
  netlist: Netlist,
  pt: Point,
): ProbePick | null => {
  const contact = nearestContact(netlist, pt)
  if (contact) return { kind: 'node', ...contact }

  const cell = {
    row: Math.floor(pt.y / CELL_SIZE),
    col: Math.floor(pt.x / CELL_SIZE),
  }
  if (!isInside(board, cell)) return null
  const placement = blockAt(board, cell)
  if (!placement) return null
  const isDevice = netlist.elements.some((e) => e.blockId === placement.blockId)
  return isDevice ? { kind: 'current', blockId: placement.blockId } : null
}

/** ドラッグの始点・終点から差動電圧の対を作る。別ノードの接点同士のときだけ成立 */
export const diffPick = (
  from: ProbePick | null,
  to: ProbePick | null,
): { readonly a: string; readonly b: string } | null => {
  if (from?.kind !== 'node' || to?.kind !== 'node') return null
  if (from.nodeId === to.nodeId) return null
  return { a: from.nodeId, b: to.nodeId }
}
