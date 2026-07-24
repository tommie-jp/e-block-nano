/**
 * 過渡波形(不等間隔の time/values)を Web Audio 用の PCM (Float32, [-1,1]) に
 * リサンプルする純関数。シミュレーション時間をそのまま実時間として鳴らす
 * (発振周波数がそのまま音の高さになる)。
 */
export const resampleToAudio = (
  time: readonly number[],
  values: readonly number[],
  sampleRate: number,
): Float32Array => {
  if (time.length < 2) return new Float32Array(0)
  const t0 = time[0]
  const t1 = time[time.length - 1]
  const span = t1 - t0
  const n = Math.max(1, Math.floor(sampleRate * span))

  // 振幅を [-1,1] に正規化 (中点を 0 に、振幅で割る)
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const mid = (min + max) / 2
  const amp = (max - min) / 2 || 1

  const out = new Float32Array(n)
  let idx = 0
  for (let i = 0; i < n; i++) {
    const t = t0 + (i / n) * span
    while (idx < time.length - 2 && time[idx + 1] < t) idx++
    // 線形補間
    const ta = time[idx]
    const tb = time[idx + 1]
    const f = tb > ta ? (t - ta) / (tb - ta) : 0
    const v = values[idx] + f * (values[idx + 1] - values[idx])
    out[i] = (v - mid) / amp
  }
  return out
}
