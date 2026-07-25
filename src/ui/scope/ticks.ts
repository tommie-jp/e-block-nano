/**
 * 軸目盛りの "nice numbers" を生成する純ユーティリティ。
 * オシロのグレーティクル (X: 時間, Y: 電圧) の刻み値に使う。
 */

/** 刻み幅を 1/2/5 × 10ⁿ の綺麗な値に丸める */
const niceStep = (rawStep: number): number => {
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const niceNorm = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10
  return niceNorm * mag
}

/**
 * [min, max] を跨ぐ nice な目盛り値の配列を返す。
 * targetCount は目安の本数 (実際は step 丸めで前後する)。
 * 退化ケース (非有限 / min==max) は空配列。
 */
export const niceTicks = (
  min: number,
  max: number,
  targetCount = 5,
): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return []
  const [lo, hi] = min < max ? [min, max] : [max, min]
  const step = niceStep((hi - lo) / Math.max(1, targetCount))
  if (!(step > 0)) return []
  // 浮動小数の誤差 (0.30000004 等) を刻み幅の桁で丸める
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const round = (v: number): number => Number(v.toFixed(decimals + 2))
  const ticks: number[] = []
  const start = Math.ceil(lo / step) * step
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(round(v))
  return ticks
}

/**
 * 主目盛りの間に入れる副目盛り(minor ticks)の値。主目盛り 1 区間を `sub` 分割し、
 * 主目盛りと重なる位置は除外する。ラベルは付けず短い刻みだけ描く用途。
 * 退化ケース (非有限 / min==max) は空配列。
 */
export const minorTicks = (
  min: number,
  max: number,
  majorTarget = 5,
  sub = 5,
): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return []
  const [lo, hi] = min < max ? [min, max] : [max, min]
  const major = niceStep((hi - lo) / Math.max(1, majorTarget))
  if (!(major > 0) || sub < 2) return []
  const minor = major / sub
  const decimals = Math.max(0, -Math.floor(Math.log10(minor)))
  const round = (v: number): number => Number(v.toFixed(decimals + 2))
  const ticks: number[] = []
  const start = Math.ceil(lo / minor) * minor
  for (let v = start; v <= hi + minor * 1e-9; v += minor) {
    const r = round(v)
    // 主目盛り(major の整数倍)は副目盛りに含めない
    const k = r / major
    if (Math.abs(k - Math.round(k)) > 1e-6) ticks.push(r)
  }
  return ticks
}
