import { evalExpr, exprKey, exprLabel, unitOf } from '../../core/scope/traceExpr'
import type { TraceExpr, Unit } from '../../core/scope/traceExpr'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { NodeProbe } from '../waveProbes'


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

/**
 * 単位の基本記号。実際の表示は軸やレンジの大きさに応じて SI 接頭辞が付く
 * (`core/scope/siPrefix`)。単位を持たない量は空文字。
 */
export const UNIT_SYMBOL: Record<Unit, string> = {
  V: 'V',
  A: 'A',
  W: 'W',
  x: '',
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

export interface DrawInput {
  readonly waveforms: Waveforms
  /** nodeId → プローブ (色とラベル。ボード上の●と対応させる) */
  readonly probes: readonly NodeProbe[]
  /** blockId → 素子の表示名 (電流・電力の凡例用) */
  readonly deviceLabels?: Readonly<Record<string, string>>
  /** AC カップリング (電圧系だけ DC を抜く) */
  readonly ac: boolean
  readonly dc: ReadonlyMap<string, number>
}

/**
 * レイアウトのトレース 1 本を描画系列にする。データが無ければ null
 * (プローブを当てた直後や、電流の出ない素子)。
 *
 * 色は電圧だけプローブ (ボードの●と同色) から取り、電流・電力はレイアウトが
 * 単位ごとのパレットで持っている色を使う。
 */
export const buildDrawTrace = (
  trace: { readonly expr: TraceExpr; readonly color: string },
  { waveforms, probes, deviceLabels = {}, ac, dc }: DrawInput,
): DrawTrace | null => {
  const expr = trace.expr
  const values = evalExpr(expr, waveforms)
  if (!values) return null
  const key = exprKey(expr)
  const device = (id: string): string => deviceLabels[id] ?? id

  switch (expr.kind) {
    case 'v': {
      const probe = probes.find((p) => p.nodeId === expr.node)
      const offset = ac ? (dc.get(expr.node) ?? meanOf(values)) : 0
      return {
        expr,
        key,
        label: probe?.label ?? expr.node,
        color: probe?.color ?? trace.color,
        constant: probe?.constant ?? false,
        values: offset ? values.map((v) => v - offset) : values,
      }
    }
    case 'vdiff': {
      const offset = ac ? meanOf(values) : 0
      return {
        expr,
        key,
        label: 'M: 両端電圧',
        color: MATH_COLOR,
        constant: false,
        values: offset ? values.map((v) => v - offset) : values,
      }
    }
    case 'i':
      return {
        expr,
        key,
        label: device(expr.block),
        color: trace.color,
        constant: false,
        values,
      }
    case 'p':
      return {
        expr,
        key,
        label: `${device(expr.block)} 電力`,
        color: trace.color,
        constant: false,
        values,
      }
    default:
      // 式トレース (Add Trace で足したもの) は式そのものをラベルにする
      return {
        expr,
        key,
        label: exprLabel(expr, {
          nodes: Object.fromEntries(probes.map((p) => [p.nodeId, p.label])),
          blocks: deviceLabels,
        }),
        color: trace.color,
        constant: false,
        values,
      }
  }
}

/** レイアウトのトレース列 → 描画系列 (データの無いものは落とす) */
export const buildDrawTraces = (
  traces: readonly { readonly expr: TraceExpr; readonly color: string }[],
  input: DrawInput,
): DrawTrace[] =>
  traces
    .map((t) => buildDrawTrace(t, input))
    .filter((t): t is DrawTrace => t !== null)

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
