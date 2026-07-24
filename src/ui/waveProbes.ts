import { parseEdgeKey } from '../core/netlist/edgeKey'
import { CELL_SIZE } from '../render/constants'
import { estimateFrequency } from '../core/simulation/spice/measure'
import type { Waveforms } from '../core/simulation/spice/mapResult'

/** 波形の系列色。凡例・波形線・ボード上の●で共有する (色=ノードの対応) */
export const SERIES_COLORS = ['#4fc3f7', '#ff8a65', '#81c784', '#ba68c8', '#fff176']

// 振幅が最大ノードの p2p のこの割合未満なら「ほぼ一定」(電源レール等) とみなす
const CONSTANT_P2P_FRACTION = 0.05
// 発振検出時に表示する周期数 (これ以上長い区間はクロップ)
const PERIODS_SHOWN = 4

/** 表示中の 1 ノード = 1 系列。色と短いラベルを持ち、凡例とボード●で共有する */
export interface NodeProbe {
  readonly nodeId: string
  readonly color: string
  readonly label: string
  /** ほぼ一定 (電源レール等)。波形も●も薄く描いて発振を邪魔しない */
  readonly constant: boolean
}

/** 系列の peak-to-peak 振幅。大配列の spread は stack overflow するのでループ */
const peakToPeak = (s: readonly number[]): number => {
  let lo = Infinity
  let hi = -Infinity
  for (const v of s) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return hi > lo ? hi - lo : 0
}

/**
 * 波形として表示するノードを選び、色・ラベル・constant を割り当てる純関数。
 * 全区間 0V (基準ノードや未接続) は描いても情報がないので除外する。
 * nodeVoltages の列挙順は netlist に対し決定的なので、色/ラベルも安定する。
 */
export const selectProbes = (waveforms: Waveforms): NodeProbe[] => {
  const { nodeVoltages } = waveforms
  const active = Object.keys(nodeVoltages).filter((id) =>
    nodeVoltages[id].some((x) => x !== 0),
  )
  const ranges = new Map(active.map((id) => [id, peakToPeak(nodeVoltages[id])]))
  const maxRange = Math.max(0, ...ranges.values())
  return active.map((nodeId, i) => ({
    nodeId,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    label: `N${i + 1}`,
    constant: maxRange > 0 && (ranges.get(nodeId) ?? 0) < CONSTANT_P2P_FRACTION * maxRange,
  }))
}

/**
 * 発振している支配的なノードと推定基本周波数を返す純関数 (無ければ null)。
 * 一定ノード (レール) を除いた中で振幅最大のものを選び、中点交差から周波数を推定する。
 * 波形の時間窓クロップと「音を鳴らす」で共有する。
 */
export const dominantOscillation = (
  waveforms: Waveforms,
  probes: readonly NodeProbe[],
): { nodeId: string; freq: number } | null => {
  let best: { nodeId: string; series: readonly number[]; range: number } | null = null
  for (const p of probes) {
    if (p.constant) continue
    const series = waveforms.nodeVoltages[p.nodeId]
    const range = peakToPeak(series)
    if (!best || range > best.range) best = { nodeId: p.nodeId, series, range }
  }
  if (!best || best.range <= 0) return null

  const freq = estimateFrequency(waveforms.time, best.series)
  return freq ? { nodeId: best.nodeId, freq } : null
}

/**
 * 表示する時間窓 [start, end]。発振していれば末尾の数周期だけに絞り、
 * 密集した波形を見やすくする。発振が無い (RC 充電等) なら全区間を返す。
 */
export const viewWindow = (
  waveforms: Waveforms,
  probes: readonly NodeProbe[],
): { start: number; end: number } => {
  const t0 = waveforms.time[0] ?? 0
  const tEnd = waveforms.time.at(-1) ?? t0
  const osc = dominantOscillation(waveforms, probes)
  if (!osc) return { start: t0, end: tEnd }
  const start = Math.max(t0, tEnd - PERIODS_SHOWN / osc.freq)
  return { start, end: tEnd }
}

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
