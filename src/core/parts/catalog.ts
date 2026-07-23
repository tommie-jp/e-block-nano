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
    id: 'resistor-1k',
    name: '抵抗 1kΩ',
    internalNets: [],
    device: { kind: 'resistor', ohms: 1000, pins: { a: 'N', b: 'S' } },
  },
  {
    id: 'capacitor-100n',
    name: 'コンデンサ 0.1µF',
    internalNets: [],
    device: { kind: 'capacitor', farads: 100e-9, pins: { a: 'N', b: 'S' } },
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
]

const byId = new Map(PARTS.map((p) => [p.id, p]))

export const getPart = (partId: string): Part => {
  const part = byId.get(partId)
  if (!part) throw new Error(`unknown part: ${partId}`)
  return part
}
