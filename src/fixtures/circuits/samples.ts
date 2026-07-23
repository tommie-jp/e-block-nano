import batterySwitchResistorLed from './battery-switch-resistor-led.json'
import voltageDivider from './voltage-divider.json'
import parallelResistors from './parallel-resistors.json'

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
    name: '00-Lチカ',
    description:
      '電池 + スイッチ + 抵抗 + LED の一番簡単な点灯回路。スイッチを閉じると LED に電流が流れる。',
    data: batterySwitchResistorLed,
  },
  {
    id: 'voltage-divider',
    name: '01-分圧回路',
    description:
      '抵抗 2 本(1kΩ + 10kΩ)で 3V を分ける。中点の電圧は 3V×10/11 ≈ 2.73V。',
    data: voltageDivider,
  },
  {
    id: 'parallel-resistors',
    name: '02-並列抵抗',
    description:
      '1kΩ と 10kΩ を電池に並列接続。合計電流 = 3mA + 0.3mA = 3.3mA。',
    data: parallelResistors,
  },
]

const byId = new Map(SAMPLE_CIRCUITS.map((s) => [s.id, s]))

export const getSample = (id: string): SampleCircuit | undefined => byId.get(id)
