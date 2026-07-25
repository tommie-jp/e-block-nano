import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { NodeProbe } from '../waveProbes'
import type { MathNodes } from './mathTrace'
import { CURRENT_COLORS } from './palette'

/**
 * 波形データから「描く系列」を作る純ロジック。値の作り方 (AC の DC 除去、
 * Y レンジ、電流の右軸レンジ、Math トレースの合成) を SVG 描画から切り離す。
 */

/** 描画用の 1 系列 */
export interface DrawTrace {
  readonly key: string
  readonly label: string
  readonly color: string
  /** ほぼ一定 (電源レール等)。薄く描いて発振の邪魔をしない */
  readonly constant: boolean
  readonly values: number[]
}

/** Math (差動) トレースの色。どのノード色とも被らない白 */
export const MATH_COLOR = '#ffffff'
/** Math トレースのキー (ノード ID と衝突しないよう固定の内部キー) */
export const MATH_KEY = '__math'

export const meanOf = (values: readonly number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

export const rangeOf = (values: readonly number[]): { lo: number; hi: number } => {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return Number.isFinite(lo) ? { lo, hi } : { lo: 0, hi: 0 }
}

/** 各プローブの DC (平均)。AC カップリングで差し引く量 */
export const dcOffsets = (
  waveforms: Waveforms,
  probes: readonly NodeProbe[],
): Map<string, number> => {
  const m = new Map<string, number>()
  for (const p of probes) m.set(p.nodeId, meanOf(waveforms.nodeVoltages[p.nodeId] ?? []))
  return m
}

/**
 * 電圧の Y レンジ。常に 0V を含めて基準線を出し、全区間フラットな退化ケースは
 * ±1 に開いて潰れを防ぐ。AC のときは各系列の DC を引いた値で測る。
 */
export const voltageRange = (
  waveforms: Waveforms,
  probes: readonly NodeProbe[],
  ac: boolean,
  dc: ReadonlyMap<string, number>,
): { min: number; max: number } => {
  let min = 0
  let max = 0
  for (const p of probes) {
    const offset = ac ? (dc.get(p.nodeId) ?? 0) : 0
    for (const v of waveforms.nodeVoltages[p.nodeId] ?? []) {
      const x = v - offset
      if (x < min) min = x
      if (x > max) max = x
    }
  }
  return min === max ? { min: -1, max: 1 } : { min, max }
}

export interface VoltageTraceInput {
  readonly waveforms: Waveforms
  /** 凡例で表示中のプローブ (この順で描く) */
  readonly visible: readonly NodeProbe[]
  readonly ac: boolean
  readonly dc: ReadonlyMap<string, number>
  readonly mathNodes?: MathNodes | null
  readonly mathValues?: readonly number[] | null
}

/** 表示中のノード電圧 (＋差動 Math) を描画系列にする */
export const buildVoltageTraces = ({
  waveforms,
  visible,
  ac,
  dc,
  mathNodes,
  mathValues,
}: VoltageTraceInput): DrawTrace[] => {
  const detrend = (id: string, raw: readonly number[]): number[] =>
    ac ? raw.map((v) => v - (dc.get(id) ?? meanOf(raw))) : [...raw]

  const traces: DrawTrace[] = visible.map((p) => ({
    key: p.nodeId,
    label: p.label,
    color: p.color,
    constant: p.constant,
    values: detrend(p.nodeId, waveforms.nodeVoltages[p.nodeId] ?? []),
  }))

  if (mathNodes && mathValues) {
    traces.push({
      key: MATH_KEY,
      label: mathNodes.label,
      color: MATH_COLOR,
      constant: false,
      values: ac ? mathValues.map((v) => v - meanOf(mathValues)) : [...mathValues],
    })
  }
  return traces
}

/** 素子電流を描画系列にする。キーは `i:` 前置でノード ID と衝突させない */
export const buildCurrentTraces = (
  currents: Readonly<Record<string, readonly number[]>>,
  labels: Readonly<Record<string, string>> = {},
): DrawTrace[] =>
  Object.keys(currents).map((id, i) => ({
    key: `i:${id}`,
    label: labels[id] ?? id,
    color: CURRENT_COLORS[i % CURRENT_COLORS.length],
    constant: false,
    values: [...currents[id]],
  }))

/** 電流の右軸レンジ [A]。0 を必ず含め、フラットでも軸が潰れないようにする */
export const currentRange = (
  traces: readonly DrawTrace[],
): { min: number; max: number } => {
  let lo = 0
  let hi = 0
  for (const t of traces)
    for (const v of t.values) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  return hi - lo < 1e-12 ? { min: lo - 1e-9, max: lo + 1e-9 } : { min: lo, max: hi }
}
