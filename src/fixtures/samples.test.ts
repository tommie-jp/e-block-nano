import { describe, expect, test } from 'vitest'
import { lintCircuit } from '../core/lint/lintCircuit'
import { buildNetlist } from '../core/netlist/build'
import type { Element } from '../core/netlist/build'
import { deserializeBoard } from '../core/persistence/boardFile'
import { getSample, SAMPLE_CIRCUITS } from './circuits/samples'

/**
 * 個別サンプルではなくレジストリ全件に対する不変条件。
 * 今後追加するサンプルも自動的に検査対象になる。
 */
describe('SAMPLE_CIRCUITS registry', () => {
  test('is non-empty and includes the Lチカ sample', () => {
    expect(SAMPLE_CIRCUITS.length).toBeGreaterThan(0)
    expect(getSample('led-blink')?.name).toBe('00-Lチカ')
    expect(getSample('nope')).toBeUndefined()
  })

  test('every sample has a unique, non-empty id and name', () => {
    const ids = SAMPLE_CIRCUITS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SAMPLE_CIRCUITS) {
      expect(s.id).not.toBe('')
      expect(s.name).not.toBe('')
      expect(s.description).not.toBe('')
    }
  })

  test('every sample name is numbered NN- with a unique number', () => {
    const numbers = SAMPLE_CIRCUITS.map((s) => {
      const m = /^(\d{2})-/.exec(s.name)
      expect(m, `${s.name} should start with NN-`).not.toBeNull()
      return m![1]
    })
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  test('every sample deserializes under the v1 schema', () => {
    for (const s of SAMPLE_CIRCUITS) {
      const board = deserializeBoard(JSON.stringify(s.data))
      expect(board.placements.length).toBeGreaterThan(0)
    }
  })

  test('every sample is a working circuit (zero lint errors)', () => {
    for (const s of SAMPLE_CIRCUITS) {
      const netlist = buildNetlist(deserializeBoard(JSON.stringify(s.data)))
      const errors = lintCircuit(netlist).filter((f) => f.severity === 'error')
      expect(errors, `${s.id} should have no lint errors`).toHaveLength(0)
    }
  })
})

/**
 * 04-マルチバイブレータの発振はクロス結合トポロジで決まる (各コンデンサが
 * 片方のコレクタと「反対側」トランジスタのベースを繋ぐ)。実発振は環境依存で
 * flaky なため、ここは engine を使わない決定論的な構造テストでレイアウトを守る。
 */
describe('astable multivibrator topology', () => {
  const netlist = () =>
    buildNetlist(
      deserializeBoard(JSON.stringify(getSample('astable-multivibrator')!.data)),
    )

  test('has 2 NPN transistors and 2 capacitors', () => {
    const kinds = netlist().elements.map((e) => e.device.kind)
    expect(kinds.filter((k) => k === 'transistor-npn')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'capacitor')).toHaveLength(2)
  })

  test('each capacitor cross-couples a collector to the OTHER base', () => {
    const els = netlist().elements
    const npns = els.filter((e) => e.device.kind === 'transistor-npn')
    const caps = els.filter((e) => e.device.kind === 'capacitor')
    const collector = (t: Element): string => t.pinNodes.collector
    const base = (t: Element): string => t.pinNodes.base

    // 各コンデンサは {あるTrのコレクタ, 別のTrのベース} を繋ぐ
    for (const cap of caps) {
      const ends = new Set([cap.pinNodes.a, cap.pinNodes.b])
      const fromT = npns.find((t) => ends.has(collector(t)))
      const toT = npns.find((t) => ends.has(base(t)))
      expect(fromT, 'cap end on a collector').toBeDefined()
      expect(toT, 'cap end on a base').toBeDefined()
      expect(fromT!.blockId).not.toBe(toT!.blockId) // クロス (別のTr)
    }
    // 2 本のコンデンサが別々のコレクタから出る (両方向のクロス結合)
    const capCollectors = caps.map(
      (cap) =>
        npns.find((t) =>
          new Set([cap.pinNodes.a, cap.pinNodes.b]).has(collector(t)),
        )!.blockId,
    )
    expect(new Set(capCollectors).size).toBe(2)
  })
})

/**
 * 06/07 は「1 個の NPN をどう繋ぐか」で性格が変わる回路。数値 (利得) は
 * samples.ngspice.test.ts で解析解と突合し、ここでは engine を使わずに
 * 配線トポロジ (どのノードに何が挟まるか) を決定論的に守る。
 */
describe('single-transistor stage topology', () => {
  const load = (id: string) =>
    buildNetlist(deserializeBoard(JSON.stringify(getSample(id)!.data)))

  /** 素子の 2 ピンが指定ノードの組と一致するか */
  const spans = (e: Element, x: string, y: string): boolean => {
    const ends = new Set(Object.values(e.pinNodes))
    return ends.size === 2 && ends.has(x) && ends.has(y)
  }

  test('06-1石アンプ: Rc がコレクタと電源、Re がエミッタと GND、1MΩ がベースと電源', () => {
    const netlist = load('common-emitter-amp')
    const els = netlist.elements
    const q = els.find((e) => e.device.kind === 'transistor-npn')!
    const battery = els.find((e) => e.device.kind === 'battery')!
    const vcc = battery.pinNodes.plus
    const gnd = netlist.groundNode!

    expect(vcc).not.toBe(gnd)
    // Rc = 4.7kΩ: 電源 → コレクタ
    const rc = els.find(
      (e) => e.device.kind === 'resistor' && e.device.ohms === 4700,
    )!
    expect(spans(rc, vcc, q.pinNodes.collector)).toBe(true)
    // Re = 100Ω: エミッタ → GND
    const re = els.find(
      (e) => e.device.kind === 'resistor' && e.device.ohms === 100,
    )!
    expect(spans(re, q.pinNodes.emitter, gnd)).toBe(true)
    // Rb = 1MΩ: 電源 → ベース (自己バイアス)
    const rb = els.find(
      (e) => e.device.kind === 'resistor' && e.device.ohms === 1_000_000,
    )!
    expect(spans(rb, vcc, q.pinNodes.base)).toBe(true)
    // 結合コンデンサ: ベース ↔ 信号源
    const src = els.find((e) => e.device.kind === 'ac-source')!
    const cap = els.find((e) => e.device.kind === 'capacitor')!
    expect(spans(cap, q.pinNodes.base, src.pinNodes.plus)).toBe(true)
    expect(src.pinNodes.minus).toBe(gnd)
  })

  test('07-エミッタフォロワ: コレクタが電源直結、負荷はエミッタ側だけ', () => {
    const netlist = load('emitter-follower')
    const els = netlist.elements
    const q = els.find((e) => e.device.kind === 'transistor-npn')!
    const battery = els.find((e) => e.device.kind === 'battery')!

    // コレクタ = 電源ノードそのもの (間に素子が無い)
    expect(q.pinNodes.collector).toBe(battery.pinNodes.plus)
    // 出力はエミッタ。10kΩ が エミッタ → GND
    const re = els.find(
      (e) => e.device.kind === 'resistor' && e.device.ohms === 10_000,
    )!
    expect(spans(re, q.pinNodes.emitter, netlist.groundNode!)).toBe(true)
  })
})
