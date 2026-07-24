/**
 * 掃引輝点(スイープ)モードの純ロジック。
 *
 * ngspice `.tran` はバッチなので、全結果を **1 回だけ** 計算し、表示だけを
 * 60fps で左→右に掃引してベンチ DSO の掃引を再現する (演算と描画を分離)。
 * リアルタイム連続演算ではなく「取得済みバッファの掃引再生」。
 *
 * 位相 `phase ∈ [0,1)` が掃引ヘッドの窓内での横位置。ヘッド時刻は窓内で
 * **線形** に進む (＝画面上を一定速度で走る。DSO の time/div と同じ)。
 * データ側の time は非等間隔なので、ヘッド時刻での値は線形補間で求める。
 */

/** 1 掃引にかける既定の秒数 (表示速度。回路時間ではなく壁時計) */
export const DEFAULT_SWEEP_SECONDS = 2

export interface Window {
  readonly start: number
  readonly end: number
}

const clamp01 = (p: number): number => (p <= 0 ? 0 : p >= 1 ? 1 : p)

/** 位相[0,1) を窓内の掃引ヘッド時刻[s]へ。窓の左端→右端を一定速度で進む */
export const sweepHeadTime = (win: Window, phase: number): number =>
  win.start + clamp01(phase) * (win.end - win.start)

/**
 * 単調増加 `time` 上で時刻 `t` の値を線形補間して返す。
 * 範囲外は端の値、空配列は null。二分探索で区間を特定する。
 */
export const sampleAt = (
  time: readonly number[],
  values: readonly number[],
  t: number,
): number | null => {
  const n = Math.min(time.length, values.length)
  if (n === 0) return null
  if (t <= time[0]) return values[0]
  if (t >= time[n - 1]) return values[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (time[mid] <= t) lo = mid
    else hi = mid
  }
  const span = time[hi] - time[lo]
  const f = span > 0 ? (t - time[lo]) / span : 0
  return values[lo] + f * (values[hi] - values[lo])
}

/**
 * 掃引ヘッド (`tHead`) までに「現れた」サンプル列を [t, v] で返す。
 *
 * - 窓 `[tStart, tHead]` の実サンプルを `maxPoints` に間引いて収集し、
 * - 末尾にヘッド時刻の補間点を必ず足す (線が `tHead` まで途切れず伸びる)。
 *
 * これを 60fps で `tHead` を進めながら描き直すと、輝線が左→右に伸びていく。
 */
export const revealedSamples = (
  time: readonly number[],
  values: readonly number[],
  tStart: number,
  tHead: number,
  maxPoints: number,
): Array<[number, number]> => {
  const n = Math.min(time.length, values.length)
  if (n === 0 || tHead < tStart) return []
  let k = 0
  while (k < n && time[k] < tStart) k++
  let last = k
  while (last < n && time[last] <= tHead) last++
  const count = last - k
  const stride = Math.max(1, Math.ceil(count / Math.max(1, maxPoints)))
  const out: Array<[number, number]> = []
  for (let j = k; j < last; j += stride) out.push([time[j], values[j]])
  // ヘッド時刻ちょうどの補間点で締める (実サンプルが tHead を跨いだ手前で
  // 止まっていても、線を tHead まで伸ばして掃引の先端を揃える)
  const head = sampleAt(time, values, tHead)
  if (head != null && (out.length === 0 || out[out.length - 1][0] < tHead)) {
    out.push([tHead, head])
  }
  return out
}
