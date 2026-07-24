import type { Netlist } from '../../core/netlist/build'

/** Math トレース (差動 A−B) の対象ノードとラベル */
export interface MathNodes {
  readonly a: string
  readonly b: string
  readonly label: string
}

/**
 * 選択中ブロックが 2 端子素子なら、その両端ノード (A,B) を返す。
 * 素子は 2 ノード間に挟まるので V(a)−V(b) = 選択素子の両端電圧になる。
 * 2 端子でない / 未選択 / 両端が同ノード (短絡) なら null。
 */
export const selectedMathNodes = (
  netlist: Netlist,
  selectedBlockId: string | null | undefined,
): MathNodes | null => {
  if (!selectedBlockId) return null
  const el = netlist.elements.find((e) => e.blockId === selectedBlockId)
  if (!el) return null
  const nodes = [...new Set(Object.values(el.pinNodes))]
  if (nodes.length !== 2) return null
  return { a: nodes[0], b: nodes[1], label: 'M: 両端電圧' }
}

/** 2 系列の差 A−B (同一 time 前提)。b が短ければ 0 埋め */
export const differenceSeries = (
  a: readonly number[],
  b: readonly number[],
): number[] => a.map((x, i) => x - (b[i] ?? 0))
