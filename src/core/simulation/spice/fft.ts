import { sampleAt } from './measure'

/** FFT のサンプル数 (2 の冪)。過渡波形をこの点数へ等間隔リサンプルして解析 */
const FFT_N = 1024

/**
 * 反復 radix-2 FFT (in-place)。re/im は同長で長さは 2 の冪。
 * 破壊的に周波数領域へ変換する。
 */
export const fft = (re: number[], im: number[]): void => {
  const n = re.length
  // ビット反転並べ替え
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k
        const b = a + (len >> 1)
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

export interface Spectrum {
  /** 各ビンの周波数 [Hz] (0..Nyquist) */
  readonly freqs: number[]
  /** 各ビンの振幅 */
  readonly mags: number[]
}

/**
 * 過渡波形 (非等間隔) の片側振幅スペクトルを返す純関数。
 * 記録全体を FFT_N 点へ等間隔リサンプルし、DC を除去、Hann 窓をかけて FFT する。
 * 発振周波数・高調波の確認用。データ不足なら空。
 */
export const magnitudeSpectrum = (
  time: readonly number[],
  values: readonly number[],
  n: number = FFT_N,
): Spectrum => {
  const t0 = time[0] ?? 0
  const t1 = time.at(-1) ?? 0
  const span = t1 - t0
  if (span <= 0 || time.length < 2) return { freqs: [], mags: [] }

  const samples: number[] = new Array(n)
  for (let i = 0; i < n; i++) samples[i] = sampleAt(time, values, t0 + (i / n) * span)
  const mean = samples.reduce((a, b) => a + b, 0) / n

  const re: number[] = new Array(n)
  const im: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    re[i] = (samples[i] - mean) * hann
  }
  fft(re, im)

  const fs = n / span // 実効サンプルレート [Hz]
  const half = n >> 1
  const freqs: number[] = new Array(half)
  const mags: number[] = new Array(half)
  for (let k = 0; k < half; k++) {
    freqs[k] = (k * fs) / n
    mags[k] = Math.hypot(re[k], im[k]) / half
  }
  return { freqs, mags }
}
