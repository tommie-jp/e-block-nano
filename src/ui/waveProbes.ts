import { parseEdgeKey } from '../core/netlist/edgeKey'
import { CELL_SIZE } from '../render/constants'
import type { Waveforms } from '../core/simulation/spice/mapResult'

/** 波形の系列色。凡例・波形線・ボード上の●で共有する (色=ノードの対応) */
export const SERIES_COLORS = ['#4fc3f7', '#ff8a65', '#81c784', '#ba68c8', '#fff176']

/** 表示中の 1 ノード = 1 系列。色と短いラベルを持ち、凡例とボード●で共有する */
export interface NodeProbe {
  readonly nodeId: string
  readonly color: string
  readonly label: string
}

/**
 * 波形として表示するノードを選び、色とラベルを割り当てる純関数。
 * 全区間 0V (基準ノードや未接続) は描いても情報がないので除外する。
 * nodeVoltages の列挙順は netlist に対し決定的なので、色/ラベルも安定する。
 */
export const selectProbes = (waveforms: Waveforms): NodeProbe[] =>
  Object.keys(waveforms.nodeVoltages)
    .filter((id) => waveforms.nodeVoltages[id].some((x) => x !== 0))
    .map((nodeId, i) => ({
      nodeId,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      label: `N${i + 1}`,
    }))

/**
 * nodeId (辺キー) をボード SVG (viewBox) 上の接点座標に戻す。
 * 辺の中点 = 隣接セルが共有する接点位置。パースできなければ null。
 */
export const probePoint = (nodeId: string): { x: number; y: number } | null => {
  const e = parseEdgeKey(nodeId)
  if (!e) return null
  return e.axis === 'H'
    ? { x: e.col * CELL_SIZE + CELL_SIZE / 2, y: e.row * CELL_SIZE }
    : { x: e.col * CELL_SIZE, y: e.row * CELL_SIZE + CELL_SIZE / 2 }
}
