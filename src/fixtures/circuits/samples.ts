import batterySwitchResistorLed from './battery-switch-resistor-led.json'

/**
 * アプリ同梱のサンプル回路 (読み取り専用の教材・出発点)。
 * data はフィクスチャ JSON を単一ソースとして持つ (テストと UI で二重管理しない)。
 * 読み込み経路は「読込 / インポート」と同じ deserializeBoard → replaceBoard に合流させる。
 * 収録は docs/02 の運用ルール準拠 (接続情報は自前入力・説明は自分の言葉・網羅再現しない)。
 */
export interface SampleCircuit {
  readonly id: string
  readonly name: string
  readonly description: string
  /** v1 スキーマの盤面データ (deserializeBoard に JSON.stringify して渡す) */
  readonly data: unknown
}

export const SAMPLE_CIRCUITS: readonly SampleCircuit[] = [
  {
    id: 'led-blink',
    name: 'Lチカ',
    description:
      '電池 + スイッチ + 抵抗 + LED の一番簡単な点灯回路。スイッチを閉じると LED に電流が流れる。',
    data: batterySwitchResistorLed,
  },
]

const byId = new Map(SAMPLE_CIRCUITS.map((s) => [s.id, s]))

export const getSample = (id: string): SampleCircuit | undefined => byId.get(id)
