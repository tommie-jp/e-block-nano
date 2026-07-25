/**
 * SI 接頭辞の選択と数値の書式。**軸の目盛りと値の表示が同じ表を引く**ための
 * 唯一の置き場所 (軸が µA なのに凡例が 0.0000015 …とならないように)。
 */

/** 表示に使う接頭辞。値に `scale` を掛けると `label` の単位で読める */
export interface SiPrefix {
  readonly scale: number
  /** 接頭辞つきの単位記号 (例: µA)。単位なしの量では空文字 */
  readonly label: string
}

/** 扱う範囲は n〜M。これを外れたら端に張り付かせ、書式側で指数表記に逃がす */
const STEPS: readonly { readonly factor: number; readonly prefix: string }[] = [
  { factor: 1e6, prefix: 'M' },
  { factor: 1e3, prefix: 'k' },
  { factor: 1, prefix: '' },
  { factor: 1e-3, prefix: 'm' },
  { factor: 1e-6, prefix: 'µ' },
  { factor: 1e-9, prefix: 'n' },
]

/**
 * その大きさを 1〜999 で読める接頭辞を選ぶ。
 * 単位を持たない量 (比・微分) は接頭辞を付けない。
 */
export const pickPrefix = (magnitude: number, unit: string): SiPrefix => {
  const m = Math.abs(magnitude)
  if (unit === '' || !Number.isFinite(m) || m === 0) return { scale: 1, label: unit }
  const step = STEPS.find((s) => m >= s.factor) ?? STEPS[STEPS.length - 1]
  return { scale: 1 / step.factor, label: `${step.prefix}${unit}` }
}

/** 有効数字 3 桁を保つ小数桁 (1.23 / 12.3 / 123) */
const decimalsFor = (shown: number): number => {
  const abs = Math.abs(shown)
  if (abs >= 100) return 0
  if (abs >= 10) return 1
  return 2
}

/**
 * 値 1 個の表示 (凡例・測定表・カーソル読取窓で共通)。
 * 接頭辞の範囲を外れた極端な値は指数表記にする。
 *
 * `reference` を渡すとその大きさで接頭辞を選ぶ。差分がちょうど 0 のときに
 * 「0.00 A」ではなく元の系列に合わせた「0.00 mA」と出すため。
 */
export const formatWithPrefix = (
  value: number,
  unit: string,
  reference?: number,
): string => {
  if (!Number.isFinite(value)) return `— ${unit}`.trim()
  const { scale, label } = pickPrefix(
    reference !== undefined && Number.isFinite(reference) && reference !== 0
      ? reference
      : value,
    unit,
  )
  const shown = value * scale
  // 接頭辞で吸収しきれない桁 (pA 以下 / GV 以上) は指数で出す
  const text =
    shown !== 0 && (Math.abs(shown) < 0.001 || Math.abs(shown) >= 1e5)
      ? shown.toExponential(2)
      : shown.toFixed(unit === '' ? 3 : decimalsFor(shown))
  return label ? `${text} ${label}` : text
}
