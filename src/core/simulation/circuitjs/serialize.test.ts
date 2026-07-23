import { describe, expect, test } from 'vitest'
import {
  createBoard,
  placeBlock,
  toggleSwitch,
} from '../../grid/board'
import { buildNetlist } from '../../netlist/build'
import { toCircuitJs } from './serialize'
import fixture from '../../../fixtures/circuits/battery-switch-resistor-led.json'
import { deserializeBoard } from '../../persistence/boardFile'

/** 出力を type 別の行へ分解する (先頭トークンで分類) */
const linesByType = (text: string): Map<string, string[][]> => {
  const map = new Map<string, string[][]>()
  for (const raw of text.split('\n')) {
    const toks = raw.split(' ')
    const type = toks[0]
    map.set(type, [...(map.get(type) ?? []), toks])
  }
  return map
}

/** type 行の端点座標 [x1,y1,x2,y2] */
const endpoints = (toks: string[]): [string, string, string, string] => [
  toks[1],
  toks[2],
  toks[3],
  toks[4],
]

const fixtureNetlist = () =>
  buildNetlist(deserializeBoard(JSON.stringify(fixture)))

describe('toCircuitJs', () => {
  test('emits one element per device and no wire lines', () => {
    const by = linesByType(toCircuitJs(fixtureNetlist()))

    expect(by.get('v')).toHaveLength(1) // 電池
    expect(by.get('r')).toHaveLength(1) // 抵抗
    expect(by.get('162')).toHaveLength(1) // LED
    expect(by.get('s')).toHaveLength(1) // スイッチ
    expect(by.get('g')).toHaveLength(1) // 接地
    expect(by.get('w')).toBeUndefined() // 配線はノード同一性へ吸収
    expect(by.get('$')).toHaveLength(1) // ヘッダ
  })

  test('carries structured device values (not free-form strings)', () => {
    const by = linesByType(toCircuitJs(fixtureNetlist()))

    // 抵抗値 1000 と電源電圧 3 が値として現れる
    expect(by.get('r')![0]).toContain('1000')
    expect(by.get('v')![0]).toContain('3')
  })

  test('shared nodes become shared coordinates (connectivity)', () => {
    const by = linesByType(toCircuitJs(fixtureNetlist()))
    const [vx1, vy1, vx2, vy2] = endpoints(by.get('v')![0]) // v: minus, plus
    const [rx1, ry1, , ] = endpoints(by.get('r')![0]) // r: a(=plus rail), b
    const [, , gx2, gy2] = [
      '',
      '',
      by.get('g')![0][1],
      by.get('g')![0][2],
    ]

    // 抵抗 a は電池 plus (v の point2) と同座標 = 同一ノード
    expect(`${rx1},${ry1}`).toBe(`${vx2},${vy2}`)
    // 接地 point1 は電池 minus (v の point1) と同座標 = 基準ノード
    expect(`${gx2},${gy2}`).toBe(`${vx1},${vy1}`)
  })

  test('switch position reflects open/closed state', () => {
    const openBoard = deserializeBoard(JSON.stringify(fixture))
    const openSwitch = linesByType(toCircuitJs(buildNetlist(openBoard))).get(
      's',
    )![0]
    // s x1 y1 x2 y2 flags position momentary → position は index 6
    expect(openSwitch[6]).toBe('1') // 開

    const switchId = openBoard.placements.find(
      (p) => p.partId === 'switch',
    )!.blockId
    const closedBoard = toggleSwitch(openBoard, switchId)
    const closedSwitch = linesByType(toCircuitJs(buildNetlist(closedBoard))).get(
      's',
    )![0]
    expect(closedSwitch[6]).toBe('0') // 閉
  })

  test('throws when the circuit has no ground node', () => {
    const noBattery = placeBlock(createBoard(6, 8), 'resistor-1k', {
      row: 0,
      col: 0,
    })
    expect(() => toCircuitJs(buildNetlist(noBattery))).toThrow(/GND/)
  })
})
