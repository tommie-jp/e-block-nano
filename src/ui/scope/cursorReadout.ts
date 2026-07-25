import { sampleAt } from './sweep'
import type { DrawTrace } from './traceSeries'

/**
 * トレースに吸着したカーソルの読み取り (LTspice のカーソル読取窓相当)。
 * カーソルは時間だけを持ち、縦位置は「そのトレースのその時刻の値」になる。
 */

export interface CursorReading {
  readonly tA: number
  readonly tB: number
  readonly vA: number
  readonly vB: number
  readonly dt: number
  readonly dv: number
  /** 1/Δt [Hz]。同じ時刻なら null */
  readonly freq: number | null
  /** 傾き Δv/Δt。同じ時刻なら null */
  readonly slope: number | null
}

export const readCursors = (
  time: readonly number[],
  trace: DrawTrace | null,
  tA: number,
  tB: number,
): CursorReading | null => {
  if (!trace) return null
  const vA = sampleAt(time, trace.values, tA)
  const vB = sampleAt(time, trace.values, tB)
  if (vA == null || vB == null) return null
  const dt = tB - tA
  const dv = vB - vA
  return {
    tA,
    tB,
    vA,
    vB,
    dt: Math.abs(dt),
    dv: Math.abs(dv),
    freq: dt === 0 ? null : 1 / Math.abs(dt),
    slope: dt === 0 ? null : dv / dt,
  }
}

/**
 * 区間 [t0, t1] の平均と RMS。`.tran` は非等間隔なので**時間重み** (台形) で
 * 積分する。区間が潰れている (カーソル無し等) ときはその時刻の値を返す。
 */
export const intervalStats = (
  time: readonly number[],
  values: readonly number[],
  t0: number,
  t1: number,
): { avg: number; rms: number } => {
  const n = Math.min(time.length, values.length)
  if (n === 0) return { avg: 0, rms: 0 }
  const lo = Math.min(t0, t1)
  const hi = Math.max(t0, t1)
  if (hi - lo <= 0) {
    const v = sampleAt(time, values, lo) ?? 0
    return { avg: v, rms: Math.abs(v) }
  }

  let sum = 0
  let sumSq = 0
  let span = 0
  for (let i = 0; i < n - 1; i++) {
    const a = Math.max(time[i], lo)
    const b = Math.min(time[i + 1], hi)
    const dt = b - a
    if (dt <= 0) continue
    // 区間の端はサンプル間を線形補間して値を取る
    const va = sampleAt(time, values, a) ?? values[i]
    const vb = sampleAt(time, values, b) ?? values[i + 1]
    sum += ((va + vb) / 2) * dt
    sumSq += ((va * va + vb * vb) / 2) * dt
    span += dt
  }
  if (span <= 0) {
    const v = sampleAt(time, values, lo) ?? 0
    return { avg: v, rms: Math.abs(v) }
  }
  return { avg: sum / span, rms: Math.sqrt(sumSq / span) }
}
