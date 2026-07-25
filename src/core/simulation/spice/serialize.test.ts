import { describe, expect, test } from 'vitest'
import { createBoard, placeBlock, toggleSwitch } from '../../grid/board'
import { buildNetlist } from '../../netlist/build'
import { deserializeBoard } from '../../persistence/boardFile'
import fixture from '../../../fixtures/circuits/battery-switch-resistor-led.json'
import { toSpice } from './serialize'

const fixtureNetlist = () =>
  buildNetlist(deserializeBoard(JSON.stringify(fixture)))

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

  test('throws when the circuit has no ground node', () => {
    const noBattery = placeBlock(createBoard(6, 8), 'resistor-1k', {
      row: 0,
      col: 0,
    })
    expect(() => toSpice(buildNetlist(noBattery))).toThrow(/GND/)
  })
})
