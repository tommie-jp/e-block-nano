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
