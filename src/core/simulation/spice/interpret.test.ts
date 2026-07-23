import { describe, expect, test } from 'vitest'
import { createBoard, placeBlock } from '../../grid/board'
import { buildNetlist } from '../../netlist/build'
import { describeResult, isLit, LED_LIT_THRESHOLD_A } from './interpret'

describe('isLit', () => {
  test('is true at or above the threshold, false below', () => {
    expect(isLit(LED_LIT_THRESHOLD_A)).toBe(true)
    expect(isLit(0.0011)).toBe(true)
    expect(isLit(-0.0011)).toBe(true) // 符号によらず絶対値で判定
    expect(isLit(LED_LIT_THRESHOLD_A / 2)).toBe(false)
    expect(isLit(undefined)).toBe(false)
  })
})

describe('describeResult', () => {
  test('reports each LED lit/unlit with mA', () => {
    const board = placeBlock(createBoard(6, 8), 'led-red', { row: 0, col: 0 })
    const netlist = buildNetlist(board)
    const ledId = netlist.elements[0].blockId

    expect(describeResult(netlist, { [ledId]: 0.0011 })).toBe(
      'LED 点灯 (1.10mA)',
    )
    expect(describeResult(netlist, { [ledId]: 0 })).toBe('LED 消灯 (0.00mA)')
  })

  test('falls back to a generic message when there is no LED', () => {
    const board = placeBlock(createBoard(6, 8), 'resistor-1k', { row: 0, col: 0 })
    expect(describeResult(buildNetlist(board), {})).toBe(
      'ノード電圧を計算しました',
    )
  })
})
