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

/**
 * 08 は「片方 ON・片方 OFF」で安定する双安定。数値は ngspice 側で見るので、
 * ここでは交差結合が抵抗であること (04 のコンデンサ = 無安定との違い) と、
 * トリガ SW がベースと GND の間にあることを守る。
 */
describe('bistable flip-flop topology', () => {
  const netlist = () =>
    buildNetlist(deserializeBoard(JSON.stringify(getSample('bistable-flipflop')!.data)))

  test('2 石・LED 2 個・トリガ SW 2 個で、コンデンサは持たない', () => {
    const kinds = netlist().elements.map((e) => e.device.kind)
    expect(kinds.filter((k) => k === 'transistor-npn')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'led')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'switch')).toHaveLength(2)
    // 交差結合が容量なら無安定 (04) になってしまう
    expect(kinds.filter((k) => k === 'capacitor')).toHaveLength(0)
  })

  test('10kΩ が「あるコレクタ ↔ 別の石のベース」を繋ぐ (直流の交差結合)', () => {
    const els = netlist().elements
    const npns = els.filter((e) => e.device.kind === 'transistor-npn')
    const cross = els.filter(
      (e) => e.device.kind === 'resistor' && e.device.ohms === 10_000,
    )
    expect(cross).toHaveLength(2)

    for (const r of cross) {
      const ends = new Set(Object.values(r.pinNodes))
      const from = npns.find((q) => ends.has(q.pinNodes.collector))
      const to = npns.find((q) => ends.has(q.pinNodes.base))
      expect(from, 'cross resistor end on a collector').toBeDefined()
      expect(to, 'cross resistor end on a base').toBeDefined()
      expect(from!.blockId).not.toBe(to!.blockId)
    }
    // 2 本が別々のコレクタから出る (両方向に効く)
    const sources = cross.map(
      (r) =>
        npns.find((q) =>
          new Set(Object.values(r.pinNodes)).has(q.pinNodes.collector),
        )!.blockId,
    )
    expect(new Set(sources).size).toBe(2)
  })

  test('各スイッチは「別々のベース」と GND の間にある', () => {
    const nl = netlist()
    const npns = nl.elements.filter((e) => e.device.kind === 'transistor-npn')
    const switches = nl.elements.filter((e) => e.device.kind === 'switch')
    const bases = switches.map((sw) => {
      const ends = Object.values(sw.pinNodes)
      expect(ends).toContain(nl.groundNode)
      const base = ends.find((n) => n !== nl.groundNode)
      expect(npns.map((q) => q.pinNodes.base)).toContain(base)
      return base
    })
    expect(new Set(bases).size).toBe(2)
    // 2 石のエミッタはどちらも GND
    for (const q of npns) expect(q.pinNodes.emitter).toBe(nl.groundNode)
  })
})

/**
 * 09 は「トリガ → CR 充電 → 点灯」の順序が回路で決まる。数値 (遅れ時間) は
 * ngspice 側で見て、ここでは充電経路の形を守る。
 */
describe('delay timer topology', () => {
  const netlist = () =>
    buildNetlist(deserializeBoard(JSON.stringify(getSample('delay-timer')!.data)))

  test('トリガ源 → 100kΩ → ベース、ベース ↔ GND に 1µF', () => {
    const nl = netlist()
    const q = nl.elements.find((e) => e.device.kind === 'transistor-npn')!
    const src = nl.elements.find((e) => e.device.kind === 'ac-source')!
    const r = nl.elements.find(
      (e) => e.device.kind === 'resistor' && e.device.ohms === 100_000,
    )!
    const cap = nl.elements.find((e) => e.device.kind === 'capacitor')!

    // 充電抵抗はトリガ源のプラスとベースの間
    expect(new Set(Object.values(r.pinNodes))).toEqual(
      new Set([src.pinNodes.plus, q.pinNodes.base]),
    )
    // タイミングコンデンサはベースと GND の間 (ここが時定数を決める)
    expect(new Set(Object.values(cap.pinNodes))).toEqual(
      new Set([q.pinNodes.base, nl.groundNode]),
    )
    // トリガ源のマイナスとエミッタは GND
    expect(src.pinNodes.minus).toBe(nl.groundNode)
    expect(q.pinNodes.emitter).toBe(nl.groundNode)
  })

  test('LED は 1kΩ とともにコレクタ側にある (点灯 = 石が ON)', () => {
    const nl = netlist()
    const q = nl.elements.find((e) => e.device.kind === 'transistor-npn')!
    const led = nl.elements.find((e) => e.device.kind === 'led')!
    const rc = nl.elements.find(
      (e) => e.device.kind === 'resistor' && e.device.ohms === 1000,
    )!
    const battery = nl.elements.find((e) => e.device.kind === 'battery')!

    // 電源 → LED → Rc → コレクタ の直列
    expect(led.pinNodes.anode).toBe(battery.pinNodes.plus)
    expect(new Set(Object.values(rc.pinNodes))).toEqual(
      new Set([led.pinNodes.cathode, q.pinNodes.collector]),
    )
  })
})
