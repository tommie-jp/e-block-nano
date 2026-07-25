import batterySwitchResistorLed from './battery-switch-resistor-led.json'
import voltageDivider from './voltage-divider.json'
import parallelResistors from './parallel-resistors.json'
import rcCharge from './rc-charge.json'
import astableMultivibrator from './astable-multivibrator.json'
import commonEmitterAmp from './common-emitter-amp.json'
import emitterFollower from './emitter-follower.json'

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
  {
    id: 'rc-charge',
    name: '03-RC充放電',
    description:
      '10kΩ + 100µF の直列。過渡解析でコンデンサが 3V へ充電される。時定数 τ=RC=1秒。',
    data: rcCharge,
  },
  {
    id: 'astable-multivibrator',
    name: '04-点滅マルチバイブレータ',
    description:
      'NPN×2 + コンデンサ×2 の無安定マルチバイブレータ。コレクタ電圧が 0V↔3V を' +
      '交互に発振(約 1.4Hz)。波形パネル(過渡解析)で点滅が見える。立体交差配線でクロス結合。',
    data: astableMultivibrator,
  },
  {
    id: 'audio-multivibrator',
    name: '05-発振音',
    description:
      '04 と同じマルチバイブレータを「音」として確認する。波形パネルの' +
      '「音を鳴らす」で、発振をそのまま可聴域へピッチシフトして再生する(Web Audio)。',
    data: astableMultivibrator,
  },
  {
    id: 'common-emitter-amp',
    name: '06-1石アンプ',
    description:
      'エミッタ接地増幅。1MΩ でベースをバイアスし(Vc≈1.9V)、10mV/1kHz の信号を' +
      '1µF で結合して入れる。コレクタに約 22 倍で反転して出る。利得は教科書の' +
      'Rc/Re=47 ではなく Rc/(Re+re) — エミッタ内部抵抗 re≈116Ω が Re=100Ω と同程度だから。',
    data: commonEmitterAmp,
  },
  {
    id: 'emitter-follower',
    name: '07-エミッタフォロワ',
    description:
      'コレクタ接地。06 の Rc を配線に、Re を 10kΩ に替えた同じ骨格。利得は約 1 倍で' +
      '反転せず、出力(エミッタ)は入力(ベース)より約 0.7V 低い。電圧は増えないが' +
      'インピーダンス変換になる。',
    data: emitterFollower,
  },
]

const byId = new Map(SAMPLE_CIRCUITS.map((s) => [s.id, s]))

export const getSample = (id: string): SampleCircuit | undefined => byId.get(id)
