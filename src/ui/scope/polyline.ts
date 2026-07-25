import { revealedSamples, sampleAt } from './sweep'

/**
 * 系列 → SVG polyline の points 文字列。過渡は適応ステップで数万点になるので
 * 間引き (stride) を挟む。掃引 (輝点) 用の途中まで版と先端座標もここに置く。
 */

/** 描画点の上限。過渡は適応ステップで数万点になる (マルチバイブレータ ~5万点) */
export const MAX_POINTS = 1000

type Scale = (v: number) => number

/**
 * 窓 [winStart, winEnd] の中だけを、最大 maxPoints 点に間引いた points 文字列。
 * 間引き率は**窓内の点数**で決める (窓の外まで数えると、深くズームしたときに
 * 窓の中がスカスカになる)。
 */
export const polylinePoints = (
  time: readonly number[],
  values: readonly number[],
  winStart: number,
  winEnd: number,
  x: Scale,
  y: Scale,
  maxPoints: number,
): string => {
  const n = Math.min(time.length, values.length)
  let k = 0
  while (k < n && time[k] < winStart) k++
  let last = k
  while (last < n && time[last] <= winEnd) last++
  // 窓の右端をまたぐ 1 点は残す (線が窓の縁で途切れないように)
  const end = Math.min(n, last + 1)
  const stride = Math.max(1, Math.ceil((end - k) / maxPoints))
  const parts: string[] = []
  for (let j = k; j < end; j += stride) parts.push(`${x(time[j])},${y(values[j])}`)
  return parts.join(' ')
}

/** 掃引ヘッドまでに現れた分だけを結ぶ points 文字列 */
export const revealedPoints = (
  time: readonly number[],
  values: readonly number[],
  winStart: number,
  tHead: number,
  x: Scale,
  y: Scale,
  maxPoints: number,
): string =>
  revealedSamples(time, values, winStart, tHead, maxPoints)
    .map(([t, v]) => `${x(t)},${y(v)}`)
    .join(' ')

/** 掃引ヘッド (輝点) の座標。データ範囲外なら null */
export const headPointAt = (
  time: readonly number[],
  values: readonly number[],
  tHead: number,
  x: Scale,
  y: Scale,
): { x: number; y: number } | null => {
  const v = sampleAt(time, values, tHead)
  return v == null ? null : { x: x(tHead), y: y(v) }
}
