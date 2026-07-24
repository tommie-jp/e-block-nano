/**
 * 過渡波形 (.tran の 1 系列) の測定量を求める純関数群。
 * ngspice は適応ステップで非等間隔なので、平均・実効値・デューティは
 * 単純なサンプル平均でなく **時間重み (台形積分)** で計算する。
 */

/** 系列の統計。発振が無ければ freq/period/duty は null */
export interface SeriesMeasure {
  readonly vmax: number
  readonly vmin: number
  readonly vpp: number
  /** 時間重み平均 (DC 分) */
  readonly vavg: number
  /** 時間重み実効値 */
  readonly vrms: number
  readonly freq: number | null
  readonly period: number | null
  /** 中点より上にある時間の割合 (0..1) */
  readonly duty: number | null
}

/** 系列の [min, max]。空配列は [0, 0] */
const range = (values: readonly number[]): { lo: number; hi: number } => {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return Number.isFinite(lo) ? { lo, hi } : { lo: 0, hi: 0 }
}

/**
 * 中点交差の回数から基本周波数 [Hz] を推定する。発振が無ければ null。
 * 波形の時間窓クロップ・音再生・測定表で共有する。
 */
export const estimateFrequency = (
  time: readonly number[],
  values: readonly number[],
): number | null => {
  const { lo, hi } = range(values)
  if (hi <= lo) return null
  const mid = (lo + hi) / 2
  let crossings = 0
  for (let i = 1; i < values.length; i++) {
    if ((values[i - 1] - mid) * (values[i] - mid) < 0) crossings++
  }
  const span = (time.at(-1) ?? 0) - (time[0] ?? 0)
  const freq = span > 0 ? crossings / 2 / span : 0
  return freq > 0 ? freq : null
}

/**
 * 任意時刻 t の値を線形補間で返す。範囲外は端値でクランプ。
 * time は昇順前提。二分探索で区間を特定する (数万点でも軽い)。
 */
export const sampleAt = (
  time: readonly number[],
  values: readonly number[],
  t: number,
): number => {
  const n = time.length
  if (n === 0) return 0
  if (t <= time[0]) return values[0]
  if (t >= time[n - 1]) return values[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (time[mid] <= t) lo = mid
    else hi = mid
  }
  const dt = time[hi] - time[lo]
  if (dt <= 0) return values[lo]
  const f = (t - time[lo]) / dt
  return values[lo] + f * (values[hi] - values[lo])
}

/** 系列全体の測定量。time/values は同長・昇順の time を前提 */
export const measureSeries = (
  time: readonly number[],
  values: readonly number[],
): SeriesMeasure => {
  const { lo: vmin, hi: vmax } = range(values)
  const total = (time.at(-1) ?? 0) - (time[0] ?? 0)

  // 台形積分で ∫v dt, ∫v² dt, 中点上の滞在時間を一括で求める
  const mid = (vmin + vmax) / 2
  let area = 0
  let areaSq = 0
  let aboveTime = 0
  for (let i = 1; i < values.length; i++) {
    const dt = time[i] - time[i - 1]
    if (dt <= 0) continue
    const a = values[i - 1]
    const b = values[i]
    area += ((a + b) / 2) * dt
    areaSq += ((a * a + b * b) / 2) * dt
    aboveTime += timeAboveMid(a, b, mid, dt)
  }

  const vavg = total > 0 ? area / total : values[0] ?? 0
  const vrms = total > 0 ? Math.sqrt(Math.max(0, areaSq / total)) : Math.abs(values[0] ?? 0)
  const freq = estimateFrequency(time, values)
  return {
    vmax,
    vmin,
    vpp: vmax - vmin,
    vavg,
    vrms,
    freq,
    period: freq ? 1 / freq : null,
    // デューティは発振している波形でのみ意味を持つ
    duty: freq && total > 0 ? aboveTime / total : null,
  }
}

/**
 * 区間 [a,b] (継続 dt) のうち mid より上にある時間。
 * 交差する区間は線形補間で交点を求めて按分する。
 */
const timeAboveMid = (a: number, b: number, mid: number, dt: number): number => {
  const aUp = a > mid
  const bUp = b > mid
  if (aUp && bUp) return dt
  if (!aUp && !bUp) return 0
  // straddle: 交点の割合 f (a→b の間で mid を横切る位置)
  const f = (mid - a) / (b - a)
  return aUp ? f * dt : (1 - f) * dt
}
