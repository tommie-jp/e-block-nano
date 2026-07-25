import { describe, expect, test } from 'vitest'
import type { SpiceNetlist } from './serialize'
import { buildStreamMap, toLiveSample } from './streamMap'

/** nodeNames だけ持つ最小の SpiceNetlist (text/currentProbes は本テストで不使用) */
const spice = (nodeNames: Record<string, string>): SpiceNetlist => ({
  text: '',
  nodeNames,
  currentProbes: {},
  deviceRefs: {},
})

describe('buildStreamMap / toLiveSample', () => {
  const net = spice({ gnd: '0', a: 'n1', b: 'n2' })
  // ngspice の SendData ベクトル並び。時間 + 電圧 + 電流(無視対象)
  const vecNames = ['time', 'V(n1)', 'V(n2)', 'i(v1)']

  test('time スロットがサンプル時刻 t になる', () => {
    const map = buildStreamMap(net, vecNames)
    const s = toLiveSample(map, [1.5e-3, 3.2, 1.1, 0.02])
    expect(s.t).toBeCloseTo(1.5e-3, 12)
  })

  test('v(n1)/v(n2) を nodeId a/b へ戻す (大文字 V( も許容)', () => {
    const map = buildStreamMap(net, vecNames)
    const s = toLiveSample(map, [1.5e-3, 3.2, 1.1, 0.02])
    expect(s.values.a).toBe(3.2)
    expect(s.values.b).toBe(1.1)
  })

  test('電流など電圧以外のベクトルは無視する', () => {
    const map = buildStreamMap(net, vecNames)
    const s = toLiveSample(map, [1.5e-3, 3.2, 1.1, 0.02])
    // i(v1) の値 0.02 はどの nodeId にも現れない
    expect(Object.values(s.values)).not.toContain(0.02)
  })

  test('基準ノードは SendData に現れないが 0V を注入して含める', () => {
    const map = buildStreamMap(net, vecNames)
    const s = toLiveSample(map, [1.5e-3, 3.2, 1.1, 0.02])
    expect(s.values.gnd).toBe(0)
  })

  test('対応 nodeId の無い v(nX) は無視する', () => {
    const map = buildStreamMap(net, ['time', 'v(n1)', 'v(n9)'])
    const s = toLiveSample(map, [0, 5, 7])
    expect(s.values.a).toBe(5)
    expect(Object.values(s.values)).not.toContain(7)
  })

  test('ngspice shared API の裸のノード名 (n1/n2) を nodeId へ戻す', () => {
    // 実際の SendData ベクトル名: 電流は 'v1#branch'、電圧は裸の 'n1'/'n2'
    const map = buildStreamMap(net, ['v1#branch', 'n2', 'n1', 'time'])
    const s = toLiveSample(map, [0.02, 1.1, 3.2, 1.5e-3])
    expect(s.t).toBeCloseTo(1.5e-3, 12)
    expect(s.values.a).toBe(3.2) // n1 → a
    expect(s.values.b).toBe(1.1) // n2 → b
    expect(Object.values(s.values)).not.toContain(0.02) // 'v1#branch'(電流) は無視
  })

  test('スロットは index 対応で値を拾う (並びが違っても正しい)', () => {
    const map = buildStreamMap(net, ['V(n2)', 'time', 'V(n1)'])
    const s = toLiveSample(map, [9.9, 4.0e-3, 8.8])
    expect(s.t).toBeCloseTo(4.0e-3, 12)
    expect(s.values.a).toBe(8.8)
    expect(s.values.b).toBe(9.9)
  })
})

describe('電流 (currentProbes) 対応', () => {
  const net: SpiceNetlist = {
    text: '',
    nodeNames: { gnd: '0', a: 'n1' },
    // blockId → 電流を読む SPICE 変数名 (電池 i(v1)、LED i(vmd1))
    currentProbes: { 'blk-batt': 'i(v1)', 'blk-led': 'i(vmd1)' },
    deviceRefs: {},
  }

  test('SendData の <vsrc>#branch を blockId 電流へマップ', () => {
    // 実際の並び: 電流(#branch) + 電圧(裸ノード名) + time
    const map = buildStreamMap(net, ['v1#branch', 'vmd1#branch', 'n1', 'time'])
    const s = toLiveSample(map, [0.005, 0.003, 1.9, 1.5e-3])
    expect(s.currents['blk-batt']).toBeCloseTo(0.005, 9) // i(v1) = v1#branch
    expect(s.currents['blk-led']).toBeCloseTo(0.003, 9) // i(vmd1) = vmd1#branch
    expect(s.values.a).toBe(1.9) // 電圧は従来どおり
  })

  test('抵抗の内部電流 @r1[i] (.save 由来) を blockId 電流へマップ', () => {
    const rnet: SpiceNetlist = {
      text: '',
      nodeNames: { gnd: '0', a: 'n1' },
      currentProbes: { 'blk-r': '@r1[i]', 'blk-batt': 'i(v1)' },
      deviceRefs: {},
    }
    const map = buildStreamMap(rnet, ['@r1[i]', 'v1#branch', 'n1', 'time'])
    const s = toLiveSample(map, [0.0011, 0.0011, 1.9, 1.5e-3])
    expect(s.currents['blk-r']).toBeCloseTo(0.0011, 9) // @r1[i] そのまま一致
    expect(s.currents['blk-batt']).toBeCloseTo(0.0011, 9) // i(v1) = v1#branch
  })

  test('電流プローブが無ければ currents は空', () => {
    const noProbe: SpiceNetlist = {
      text: '',
      nodeNames: { gnd: '0', a: 'n1' },
      currentProbes: {},
      deviceRefs: {},
    }
    const map = buildStreamMap(noProbe, ['n1', 'time'])
    const s = toLiveSample(map, [1.9, 1.5e-3])
    expect(Object.keys(s.currents)).toEqual([])
    expect(s.values.a).toBe(1.9)
  })
})
