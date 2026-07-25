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

/** 可聴域の下限 [Hz]。これより遅い発振はそのままでは聞こえない */
const AUDIBLE_MIN_HZ = 20
/**
 * 低速発振を鳴らすときの再生倍率 (固定)。
 * 測定周波数で割って一定の高さに正規化すると、可変抵抗を回しても音程が変わらず
 * 「つまみで音程を変える」体験が成立しない。倍率を固定すれば
 * 音程比 = 発振周波数比になり、回路の変化がそのまま音になる。
 */
export const AUDIO_SPEEDUP = 100

/**
 * 過渡波形をそのまま鳴らすときの再生速度。可聴域より遅い発振だけ倍速にする。
 * (1kHz の増幅器のように既に可聴域の回路は等倍で鳴らす)
 */
export const audioSpeedup = (freq: number): number =>
  freq > 0 && freq < AUDIBLE_MIN_HZ ? AUDIO_SPEEDUP : 1
