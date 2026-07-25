/** オシロの読み取り値の書式。桁に応じて単位を自動で選ぶ */

export const fmtT = (t: number): string =>
  Math.abs(t) >= 1 ? `${t.toFixed(2)} s` : `${(t * 1000).toFixed(0)} ms`

export const fmtHz = (f: number): string =>
  f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(2)} Hz`

export const fmtV = (v: number): string =>
  Math.abs(v) >= 1 ? `${v.toFixed(2)} V` : `${(v * 1000).toFixed(0)} mV`

export const fmtI = (a: number): string => {
  const abs = Math.abs(a)
  if (abs >= 1e-3) return `${(a * 1e3).toFixed(2)} mA`
  if (abs >= 1e-6) return `${(a * 1e6).toFixed(1)} µA`
  return `${(a * 1e9).toFixed(0)} nA`
}
