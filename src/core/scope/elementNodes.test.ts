import { describe, expect, test } from 'vitest'
import { createBoard, placeBlock } from '../grid/board'
import { buildNetlist } from '../netlist/build'
import { currentExpr, powerExpr, terminalNodes } from './elementNodes'

const boardWith = (partId: string) =>
  placeBlock(createBoard(6, 8), partId, { row: 2, col: 2 })

describe('terminalNodes', () => {
  test('returns both node ids of a two-terminal element', () => {
    const board = boardWith('resistor-1k')
    const netlist = buildNetlist(board)
    const { blockId } = board.placements[0]

    expect(terminalNodes(netlist, blockId)).toEqual({
      a: netlist.elements[0].pinNodes.a,
      b: netlist.elements[0].pinNodes.b,
    })
  })

  test('returns null for a three-terminal element (no single pair)', () => {
    const board = boardWith('transistor-npn')

    expect(terminalNodes(buildNetlist(board), board.placements[0].blockId)).toBeNull()
  })

  test('returns null for an unknown block', () => {
    expect(terminalNodes(buildNetlist(boardWith('resistor-1k')), 'nope')).toBeNull()
  })
})

describe('powerExpr / currentExpr', () => {
  test('power carries the terminal pair so evaluation needs no netlist', () => {
    const board = boardWith('led-red')
    const netlist = buildNetlist(board)
    const { blockId } = board.placements[0]
    const pins = netlist.elements[0].pinNodes

    expect(powerExpr(netlist, blockId)).toEqual({
      kind: 'p',
      block: blockId,
      a: pins.anode,
      b: pins.cathode,
    })
  })

  test('power is not available for a three-terminal element', () => {
    const board = boardWith('transistor-npn')

    expect(powerExpr(buildNetlist(board), board.placements[0].blockId)).toBeNull()
  })

  test('current needs no terminals', () => {
    expect(currentExpr('blk-1')).toEqual({ kind: 'i', block: 'blk-1' })
  })
})
