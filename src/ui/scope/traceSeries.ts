import { evalExpr, exprKey, unitOf } from '../../core/scope/traceExpr'
import type { TraceExpr, Unit } from '../../core/scope/traceExpr'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { NodeProbe } from '../waveProbes'
import type { MathNodes } from './mathTrace'
import { CURRENT_COLORS, POWER_COLORS } from './palette'

/**
 * 波形データから「描く系列」を作る純ロジック。値の作り方 (AC の DC 除去、
 * Y レンジ、電流の右軸レンジ、Math トレースの合成) を SVG 描画から切り離す。
 */

/** 描画用の 1 系列。`expr` がこの系列の正体 (単位・ペイン配属はここから決まる) */
export interface DrawTrace {
  readonly expr: TraceExpr
  /** `exprKey(expr)`。React の key とレイアウト上の同一判定に使う */
  readonly key: string
  readonly label: string
  readonly color: string
  /** ほぼ一定 (電源レール等)。薄く描いて発振の邪魔をしない */
  readonly constant: boolean
  readonly values: number[]
}

/** Math (差動) トレースの色。どのノード色とも被らない白 */
export const MATH_COLOR = '#ffffff'

/** 表示単位の倍率と記号 (V はそのまま、電流・電力は m 接頭辞で読む) */
export const UNIT_DISPLAY: Record<Unit, { scale: number; label: string }> = {
  V: { scale: 1, label: 'V' },
  A: { scale: 1000, label: 'mA' },
  W: { scale: 1000, label: 'mW' },
}

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
    expr: { kind: 'v', node: p.nodeId },
    key: exprKey({ kind: 'v', node: p.nodeId }),
    label: p.label,
    color: p.color,
    constant: p.constant,
    values: detrend(p.nodeId, waveforms.nodeVoltages[p.nodeId] ?? []),
  }))

  if (mathNodes && mathValues) {
    const expr: TraceExpr = { kind: 'vdiff', a: mathNodes.a, b: mathNodes.b }
    traces.push({
      expr,
      key: exprKey(expr),
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
    expr: { kind: 'i', block: id },
    key: exprKey({ kind: 'i', block: id }),
    label: labels[id] ?? id,
    color: CURRENT_COLORS[i % CURRENT_COLORS.length],
    constant: false,
    values: [...currents[id]],
  }))

/**
 * 電力トレース。式 (P=(V(a)−V(b))·I) を波形上で評価する。データが揃っていない
 * 素子は黙って飛ばす (プローブを当てた直後や、電流が出ない素子)。
 */
export const buildPowerTraces = (
  exprs: readonly TraceExpr[],
  waveforms: Waveforms,
  labels: Readonly<Record<string, string>> = {},
): DrawTrace[] => {
  const out: DrawTrace[] = []
  for (const expr of exprs) {
    if (expr.kind !== 'p') continue
    const values = evalExpr(expr, waveforms)
    if (!values) continue
    out.push({
      expr,
      key: exprKey(expr),
      label: `${labels[expr.block] ?? expr.block} 電力`,
      color: POWER_COLORS[out.length % POWER_COLORS.length],
      constant: false,
      values,
    })
  }
  return out
}

/**
 * 系列群のレンジ。0 を必ず含めて基準線を出し、フラットな退化ケースは
 * `flatPad` だけ開いて軸が潰れないようにする (電圧は ±1V、電流/電力は ±1n)。
 */
export const traceRange = (
  traces: readonly DrawTrace[],
  flatPad: number,
): { min: number; max: number } => {
  let lo = 0
  let hi = 0
  for (const t of traces)
    for (const v of t.values) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  return hi - lo < 1e-12 ? { min: lo - flatPad, max: hi + flatPad } : { min: lo, max: hi }
}

/** その単位のトレースだけを取り出す */
export const tracesOfUnit = (
  traces: readonly DrawTrace[],
  unit: Unit,
): DrawTrace[] => traces.filter((t) => unitOf(t.expr) === unit)
