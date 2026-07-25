import { describe, expect, test } from 'vitest'
import { createBoard, placeBlock } from '../../core/grid/board'
import { buildNetlist } from '../../core/netlist/build'
import { CELL_SIZE } from '../../render/constants'
import { diffPick, pickProbe } from './probePick'

/** resistor-1k を (2,2) に置いた盤面 (a=N辺 H:2,2 / b=S辺 H:3,2) */
const resistorBoard = () =>
  placeBlock(createBoard(6, 8), 'resistor-1k', { row: 2, col: 2 })

/** セル (row,col) の中央座標 */
const cellCenter = (row: number, col: number) => ({
  x: col * CELL_SIZE + CELL_SIZE / 2,
  y: row * CELL_SIZE + CELL_SIZE / 2,
})

describe('pickProbe', () => {
  test('picks the node of the nearest contact when the point is on a contact', () => {
    // Arrange: H:2,2 の接点 = セル(2,2)の上辺中点
    const board = resistorBoard()
    const netlist = buildNetlist(board)
    const contact = { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 2 * CELL_SIZE }

    // Act
    const pick = pickProbe(board, netlist, contact)

    // Assert
    expect(pick).toEqual({
      kind: 'node',
      nodeId: netlist.elements[0].pinNodes.a,
      edge: 'H:2,2',
    })
  })

  test('picks the element current when the point is inside a device cell', () => {
    const board = resistorBoard()
    const netlist = buildNetlist(board)

    const pick = pickProbe(board, netlist, cellCenter(2, 2))

    expect(pick).toEqual({ kind: 'current', blockId: board.placements[0].blockId })
  })

  test('a contact wins over the device cell it sits on', () => {
    // 素子セルの内側でも、接点のすぐ近く (半径内) なら電圧プローブ
    const board = resistorBoard()
    const netlist = buildNetlist(board)
    const nearContact = { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 2 * CELL_SIZE + 6 }

    expect(pickProbe(board, netlist, nearContact)).toEqual({
      kind: 'node',
      nodeId: netlist.elements[0].pinNodes.a,
      edge: 'H:2,2',
    })
  })

  test('returns null on an empty cell', () => {
    const board = resistorBoard()

    expect(pickProbe(board, buildNetlist(board), cellCenter(0, 0))).toBeNull()
  })

  test('returns null inside a wire block (no device = no current to probe)', () => {
    const board = placeBlock(createBoard(6, 8), 'wire-i', { row: 1, col: 1 })

    expect(pickProbe(board, buildNetlist(board), cellCenter(1, 1))).toBeNull()
  })

  test('returns null outside the board', () => {
    const board = resistorBoard()

    expect(pickProbe(board, buildNetlist(board), { x: -50, y: -50 })).toBeNull()
  })
})

describe('diffPick', () => {
  const a = { kind: 'node', nodeId: 'H:2,2', edge: 'H:2,2' } as const
  const b = { kind: 'node', nodeId: 'H:3,2', edge: 'H:3,2' } as const

  test('two different node picks become a differential pair', () => {
    expect(diffPick(a, b)).toEqual({ a: 'H:2,2', b: 'H:3,2' })
  })

  test('the same node twice is not a differential pair', () => {
    expect(diffPick(a, a)).toBeNull()
  })

  test('a current pick is never part of a differential pair', () => {
    expect(diffPick(a, { kind: 'current', blockId: 'b1' })).toBeNull()
    expect(diffPick(null, b)).toBeNull()
  })
})
