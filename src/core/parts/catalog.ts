import type { Part } from './types'

/**
 * PoC 用の最小カタログ。値・ラインナップは学習用の一般的な部品を目安に用意する。
 * ワイヤ系は internalNets のみ、素子系は device のみを持つ。
 */
export const PARTS: readonly Part[] = [
  {
    id: 'wire-i',
    name: '配線 (直線)',
    internalNets: [['N', 'S']],
  },
  {
    id: 'wire-l',
    name: '配線 (コーナー)',
    internalNets: [['N', 'E']],
  },
  {
    id: 'wire-t',
    name: '配線 (T)',
    internalNets: [['N', 'E', 'S']],
  },
  {
    id: 'wire-x',
    name: '配線 (十字)',
    internalNets: [['N', 'E', 'S', 'W']],
  },
  {
    id: 'wire-cross',
    name: '配線 (立体交差)',
    // N-S と E-W を別グループにして交差させる (互いに導通しないブリッジ)
    internalNets: [
      ['N', 'S'],
      ['E', 'W'],
    ],
  },
  {
    id: 'resistor-1k',
    name: '抵抗 1kΩ',
    internalNets: [],
    device: { kind: 'resistor', ohms: 1000, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'resistor-100',
    name: '抵抗 100Ω',
    internalNets: [],
    device: { kind: 'resistor', ohms: 100, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'resistor-470',
    name: '抵抗 470Ω',
    internalNets: [],
    device: { kind: 'resistor', ohms: 470, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'resistor-4k7',
    name: '抵抗 4.7kΩ',
    internalNets: [],
    device: { kind: 'resistor', ohms: 4700, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'resistor-10k',
    name: '抵抗 10kΩ',
    internalNets: [],
    device: { kind: 'resistor', ohms: 10000, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'resistor-33k',
    name: '抵抗 33kΩ',
    internalNets: [],
    device: { kind: 'resistor', ohms: 33000, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'resistor-47k',
    name: '抵抗 47kΩ',
    internalNets: [],
    device: { kind: 'resistor', ohms: 47000, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'resistor-100k',
    name: '抵抗 100kΩ',
    internalNets: [],
    device: { kind: 'resistor', ohms: 100000, pins: { a: 'N', b: 'S' } },
  },
  {
    // 可変抵抗。ワイパ位置は配置ごとの state.wiperPct (省略時 50%)
    id: 'potentiometer-100k',
    name: '可変抵抗 100kΩ',
    internalNets: [],
    device: { kind: 'potentiometer', maxOhms: 100000, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'capacitor-100n',
    name: 'コンデンサ 0.1µF',
    internalNets: [],
    device: { kind: 'capacitor', farads: 100e-9, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'capacitor-1u',
    name: 'コンデンサ 1µF',
    internalNets: [],
    device: { kind: 'capacitor', farads: 1e-6, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'capacitor-4u7',
    name: 'コンデンサ 4.7µF',
    internalNets: [],
    device: { kind: 'capacitor', farads: 4.7e-6, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'capacitor-10u',
    name: '電解コンデンサ 10µF',
    internalNets: [],
    device: { kind: 'capacitor', farads: 10e-6, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'capacitor-100u',
    name: '電解コンデンサ 100µF',
    internalNets: [],
    device: { kind: 'capacitor', farads: 100e-6, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'led-red',
    name: 'LED (赤)',
    internalNets: [],
    device: { kind: 'led', model: 'LED_RED', pins: { anode: 'N', cathode: 'S' } },
  },
  {
    id: 'diode-schottky',
    name: 'ダイオード (BAT43)',
    internalNets: [],
    device: { kind: 'diode', model: 'BAT43', pins: { anode: 'N', cathode: 'S' } },
  },
  {
    id: 'transistor-npn',
    name: 'トランジスタ (NPN)',
    internalNets: [],
    device: {
      kind: 'transistor-npn',
      model: '2SC1815',
      pins: { collector: 'N', base: 'E', emitter: 'S' },
    },
  },
  {
    id: 'switch',
    name: 'スイッチ',
    internalNets: [],
    device: { kind: 'switch', pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'battery-3v',
    name: '電池 3V',
    internalNets: [],
    device: { kind: 'battery', volts: 3, pins: { plus: 'N', minus: 'S' } },
  },
  {
    /**
     * 小信号入力。1石アンプ (Rc/Re = 4.7k/100 → 利得 ≈ 47) を 3V レールで
     * クリップさせない上限が 20mVpp なので、振幅は 10mV にしている。
     */
    id: 'source-sine-10m',
    name: '信号源 10mV/1kHz',
    internalNets: [],
    device: {
      kind: 'ac-source',
      wave: { kind: 'sin', offsetVolts: 0, amplitudeVolts: 0.01, hertz: 1000 },
      pins: { plus: 'N', minus: 'S' },
    },
  },
  {
    /** AF 入力。利得 ≈ 1 のエミッタフォロワなど、そのまま見える大きさ */
    id: 'source-sine-500m',
    name: '信号源 0.5V/1kHz',
    internalNets: [],
    device: {
      kind: 'ac-source',
      wave: { kind: 'sin', offsetVolts: 0, amplitudeVolts: 0.5, hertz: 1000 },
      pins: { plus: 'N', minus: 'S' },
    },
  },
  {
    /**
     * 単発トリガ。周期を解析時間より長く取って 1 発だけ出す。
     * 幅は単安定の時定数 (0.7·R·C) より短くないと復帰が見えない。
     */
    id: 'source-pulse',
    name: 'トリガ源 3V',
    internalNets: [],
    device: {
      kind: 'ac-source',
      wave: {
        kind: 'pulse',
        lowVolts: 0,
        highVolts: 3,
        delaySeconds: 1e-3,
        widthSeconds: 2e-3,
        periodSeconds: 10,
      },
      pins: { plus: 'N', minus: 'S' },
    },
  },
]

const byId = new Map(PARTS.map((p) => [p.id, p]))

export const getPart = (partId: string): Part => {
  const part = byId.get(partId)
  if (!part) throw new Error(`unknown part: ${partId}`)
  return part
}
