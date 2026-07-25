import { describe, expect, test } from 'vitest'
import { createBoard, placeBlock, toggleSwitch } from '../../grid/board'
import { buildNetlist } from '../../netlist/build'
import { deserializeBoard } from '../../persistence/boardFile'
import fixture from '../../../fixtures/circuits/battery-switch-resistor-led.json'
import { toSpice } from './serialize'
import type { Element, Netlist } from '../../netlist/build'

const fixtureNetlist = () =>
  buildNetlist(deserializeBoard(JSON.stringify(fixture)))

/**
 * 素子だけを直接与える合成 netlist。カタログ部品がまだ無い素子
 * (可変抵抗・信号源) の変換を、盤面を組まずに検証するために使う。
 * nets / nodeOfEdge は toSpice が見ないので空でよい。
 */
const syntheticNetlist = (
  elements: readonly Element[],
  groundNode = 'gnd',
): Netlist => ({ nets: [], elements, nodeOfEdge: {}, groundNode })

/** NPN を含む最小盤面 (電池は groundNode を作るために必要) */
const npnNetlist = () => {
  const board = placeBlock(
    placeBlock(createBoard(6, 8), 'battery-3v', { row: 0, col: 0 }),
    'transistor-npn',
    { row: 2, col: 2 },
  )
  return buildNetlist(board)
}

/** SPICE 本文を要素行の配列にする (先頭のタイトル行と末尾カードを除く関心部分) */
const bodyLines = (text: string): string[] =>
  text.split('\n').filter((l) => l && !l.startsWith('.') && l !== 'e-block-nano circuit')

describe('toSpice', () => {
  test('grounds the reference node at 0 and numbers the rest', () => {
    const { nodeNames, text } = toSpice(fixtureNetlist())

    const names = Object.values(nodeNames)
    expect(names).toContain('0') // 基準ノード
    // 4 ネット → 0 と n1..n3
    expect(new Set(names).size).toBe(4)
    expect(text).toContain('.op')
    expect(text.trimEnd().endsWith('.end')).toBe(true)
  })

  test('emits a DC source, resistor, LED (with ammeter) and switch-as-resistor', () => {
    const { text, currentProbes } = toSpice(fixtureNetlist())
    const body = bodyLines(text)

    expect(body.some((l) => /^V\d+ \S+ \S+ DC 3$/.test(l))).toBe(true) // 電池 3V
    expect(body.some((l) => /^R\d+ \S+ \S+ 1000$/.test(l))).toBe(true) // 抵抗
    expect(body.some((l) => /^D\d+ \S+ \S+ ELED$/.test(l))).toBe(true) // LED
    expect(body.some((l) => /^VmD\d+ \S+ \S+ DC 0$/.test(l))).toBe(true) // LED 電流計
    expect(text).toContain('.model ELED D')

    // 電池と LED の電流プローブが登録される
    const probeVars = Object.values(currentProbes)
    expect(probeVars.some((v) => /^i\(v\d+\)$/.test(v))).toBe(true) // 電池
    expect(probeVars.some((v) => /^i\(vmd\d+\)$/.test(v))).toBe(true) // LED
  })

  test('registers alterable device refs (R/V) for live alter', () => {
    const { deviceRefs } = toSpice(fixtureNetlist())
    const refs = Object.values(deviceRefs)
    // 抵抗 or スイッチ(抵抗置換) → r<k>、電池 → v<k>
    expect(refs.some((r) => /^r\d+$/.test(r))).toBe(true)
    expect(refs.some((r) => /^v\d+$/.test(r))).toBe(true)
    // blockId をキーに素子参照が引ける (alter の宛先)
    expect(Object.keys(deviceRefs).length).toBeGreaterThan(0)
  })

  test('抵抗・スイッチの電流プローブは @ref[i] 形式 (.save で出す素子内部電流)', () => {
    const { currentProbes } = toSpice(fixtureNetlist())
    const probes = Object.values(currentProbes)
    expect(probes.some((p) => /^@r\d+\[i\]$/.test(p))).toBe(true) // 抵抗 or スイッチ
    expect(probes.some((p) => /^i\(v\d+\)$/.test(p))).toBe(true) // 電池は従来どおり
  })

  test('switch resistance reflects open/closed state', () => {
    const openBoard = deserializeBoard(JSON.stringify(fixture))
    const switchId = openBoard.placements.find(
      (p) => p.partId === 'switch',
    )!.blockId

    const openText = toSpice(buildNetlist(openBoard)).text
    expect(openText).toContain('1e9') // 開 = 高抵抗

    const closedText = toSpice(buildNetlist(toggleSwitch(openBoard, switchId))).text
    expect(closedText).toContain('0.001') // 閉 = 低抵抗
    expect(closedText).not.toContain('1e9')
  })

  test('emits an NPN transistor as a Q line with a model', () => {
    // 電池も置いて groundNode を作る (変換の前提)
    let board = placeBlock(createBoard(6, 8), 'battery-3v', { row: 0, col: 0 })
    board = placeBlock(board, 'transistor-npn', { row: 2, col: 2 })
    const { text } = toSpice(buildNetlist(board))

    // Q<k> collector base emitter <model>
    expect(text).toMatch(/^Q\d+ \S+ \S+ \S+ ENPN$/m)
    expect(text).toContain('.model ENPN NPN')
  })

  test('emits .op by default and .tran when requested', () => {
    const netlist = fixtureNetlist()
    expect(toSpice(netlist).text).toContain('.op')

    const tran = toSpice(netlist, { kind: 'tran', step: 0.02, stop: 5 }).text
    expect(tran).toContain('.tran 0.02 5 uic')
    expect(tran).not.toContain('.op')
  })

  test('過渡の起動条件を明示できる (動作点から / 初期値 0 から / キック付き)', () => {
    const npn = npnNetlist()
    const tran = { kind: 'tran', step: 0.02, stop: 5 } as const

    // 動作点から: DC 解を初期値にするので uic もキックも付けない
    const op = toSpice(npn, { ...tran, startup: 'operating-point' }).text
    expect(op).toContain('.tran 0.02 5')
    expect(op).not.toContain('uic')
    expect(op).not.toContain('.ic ')

    // 初期値 0 から: uic だけ (コンデンサを 0 から充電する 03 の挙動)
    const zero = toSpice(npn, { ...tran, startup: 'zero-state' }).text
    expect(zero).toContain('.tran 0.02 5 uic')
    expect(zero).not.toContain('.ic ')

    // キック付き: 対称マルチを起動させるため最初の NPN を ON 側に固定する
    const kick = toSpice(npn, { ...tran, startup: 'uic-kick' }).text
    expect(kick).toMatch(/^\.ic v\(\S+\)=0\.7 v\(\S+\)=0\.1$/m)
    expect(kick).toContain('.tran 0.02 5 uic')
  })

  test('起動条件を省略したら従来動作 (NPN があればキック付き、無ければ初期値 0)', () => {
    const tran = { kind: 'tran', step: 0.02, stop: 5 } as const

    const withNpn = toSpice(npnNetlist(), tran).text
    expect(withNpn).toBe(toSpice(npnNetlist(), { ...tran, startup: 'uic-kick' }).text)

    const withoutNpn = toSpice(fixtureNetlist(), tran).text
    expect(withoutNpn).toBe(
      toSpice(fixtureNetlist(), { ...tran, startup: 'zero-state' }).text,
    )
  })

  test('可変抵抗は wiperPct を掛けた抵抗として出す (alter の宛先つき)', () => {
    const pot = (wiperPct?: number): Element => ({
      blockId: 'vr1',
      device: {
        kind: 'potentiometer',
        maxOhms: 100_000,
        pins: { a: 'N', b: 'S' },
      },
      pinNodes: { a: 'n_top', b: 'gnd' },
      ...(wiperPct === undefined ? {} : { state: { wiperPct } }),
    })

    const at30 = toSpice(syntheticNetlist([pot(30)]))
    expect(at30.text).toMatch(/^R\d+ \S+ 0 30000$/m)
    // 実行中に回せるよう抵抗として alter 宛先に載る
    expect(at30.deviceRefs.vr1).toMatch(/^r\d+$/)
    expect(at30.currentProbes.vr1).toMatch(/^@r\d+\[i\]$/)

    // 省略時は中央 (50%)
    expect(toSpice(syntheticNetlist([pot()])).text).toMatch(/^R\d+ \S+ 0 50000$/m)
  })

  test('信号源は SIN / PULSE の電圧源として出す', () => {
    const source = (wave: Element['device']): Element => ({
      blockId: 'src1',
      device: wave,
      pinNodes: { plus: 'n_in', minus: 'gnd' },
    })

    const sin = toSpice(
      syntheticNetlist([
        source({
          kind: 'ac-source',
          wave: {
            kind: 'sin',
            offsetVolts: 0,
            amplitudeVolts: 0.05,
            hertz: 1000,
          },
          pins: { plus: 'N', minus: 'S' },
        }),
      ]),
    )
    expect(sin.text).toMatch(/^V\d+ \S+ 0 SIN\(0 0\.05 1000\)$/m)
    // 源の電流は測れる (電池と同じ i(v<k>))
    expect(sin.currentProbes.src1).toMatch(/^i\(v\d+\)$/)
    // DC 値を書き換える alter は波形源には意味が違うので宛先にしない
    expect(sin.deviceRefs.src1).toBeUndefined()

    const pulse = toSpice(
      syntheticNetlist([
        source({
          kind: 'ac-source',
          wave: {
            kind: 'pulse',
            lowVolts: 0,
            highVolts: 3,
            delaySeconds: 0.001,
            widthSeconds: 0.002,
            periodSeconds: 10,
          },
          pins: { plus: 'N', minus: 'S' },
        }),
      ]),
    )
    // PULSE(v1 v2 td tr tf pw per)。tr/tf=0 は ngspice が tstep を使う
    expect(pulse.text).toMatch(/^V\d+ \S+ 0 PULSE\(0 3 0\.001 0 0 0\.002 10\)$/m)
  })

  test('throws when the circuit has no ground node', () => {
    const noBattery = placeBlock(createBoard(6, 8), 'resistor-1k', {
      row: 0,
      col: 0,
    })
    expect(() => toSpice(buildNetlist(noBattery))).toThrow(/GND/)
  })
})
