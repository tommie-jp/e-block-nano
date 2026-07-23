import type { Part } from './types'

/**
 * PoC 用の最小カタログ。値・ラインナップは学習用の一般的な部品を目安に用意する。
 */
export const PARTS: readonly Part[] = [
  {
    id: 'wire-i',
    name: '配線 (直線)',
    kind: 'wire',
    internalNets: [['N', 'S']],
  },
  {
    id: 'wire-l',
    name: '配線 (コーナー)',
    kind: 'wire',
    internalNets: [['N', 'E']],
  },
  {
    id: 'wire-t',
    name: '配線 (T)',
    kind: 'wire',
    internalNets: [['N', 'E', 'S']],
  },
  {
    id: 'wire-x',
    name: '配線 (十字)',
    kind: 'wire',
    internalNets: [['N', 'E', 'S', 'W']],
  },
  {
    id: 'resistor-1k',
    name: '抵抗 1kΩ',
    kind: 'resistor',
    internalNets: [['N', 'S']],
    spiceModelRef: 'R value=1k',
  },
  {
    id: 'capacitor-100n',
    name: 'コンデンサ 0.1µF',
    kind: 'capacitor',
    internalNets: [['N', 'S']],
    spiceModelRef: 'C value=100n',
  },
  {
    id: 'led-red',
    name: 'LED (赤)',
    kind: 'led',
    internalNets: [['N', 'S']],
    spiceModelRef: 'D model=LED_RED',
  },
  {
    id: 'diode-schottky',
    name: 'ダイオード (BAT43)',
    kind: 'diode',
    internalNets: [['N', 'S']],
    spiceModelRef: 'D model=BAT43',
  },
  {
    id: 'transistor-npn',
    name: 'トランジスタ (NPN)',
    kind: 'transistor-npn',
    internalNets: [['N'], ['E'], ['S']],
    spiceModelRef: 'Q model=2SC1815',
  },
  {
    id: 'switch',
    name: 'スイッチ',
    kind: 'switch',
    internalNets: [['N'], ['S']],
  },
  {
    id: 'battery-3v',
    name: '電池 3V',
    kind: 'battery',
    internalNets: [['N'], ['S']],
    spiceModelRef: 'V value=3',
  },
]

const byId = new Map(PARTS.map((p) => [p.id, p]))

export const getPart = (partId: string): Part => {
  const part = byId.get(partId)
  if (!part) throw new Error(`unknown part: ${partId}`)
  return part
}
