/** 表示用の単位整形 (盤面のつまみとライブオシロのスライダで共用) */

/** 抵抗値の表示。1kΩ 以上は kΩ。例: 4.7 kΩ / 470 Ω */
export const formatOhms = (ohms: number): string =>
  ohms >= 1000 ? `${(ohms / 1000).toFixed(1)} kΩ` : `${ohms.toFixed(0)} Ω`
