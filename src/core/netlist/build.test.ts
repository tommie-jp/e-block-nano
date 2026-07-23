import { describe, expect, test } from 'vitest'
import { createBoard, placeBlock, rotateBlock } from '../grid/board'
import { buildNets } from './build'

describe('buildNets', () => {
  test('returns no nets for an empty board', () => {
    expect(buildNets(createBoard(6, 8))).toHaveLength(0)
  })

  test('joins two vertically adjacent straight wires into one net', () => {
    // Arrange: wire-i は N-S 導通。縦に並べると境界の辺を共有する
    let board = createBoard(6, 8)
    board = placeBlock(board, 'wire-i', { row: 0, col: 0 })
    board = placeBlock(board, 'wire-i', { row: 1, col: 0 })

    // Act
    const nets = buildNets(board)

    // Assert: N(0,0)–[共有辺]–S(1,0) が 1 ネットに繋がる
    const joined = nets.find((n) => n.terminals.length === 4)
    expect(joined).toBeDefined()
  })

  test('does not join blocks that only touch at unconnected edges', () => {
    // wire-i (N-S) を横に並べても E/W は端子ではないので繋がらない
    let board = createBoard(6, 8)
    board = placeBlock(board, 'wire-i', { row: 0, col: 0 })
    board = placeBlock(board, 'wire-i', { row: 0, col: 1 })

    const nets = buildNets(board)

    expect(nets.every((n) => n.terminals.length <= 2)).toBe(true)
  })

  test('respects block orientation', () => {
    // wire-i (N-S) を 90° 回すと E-W 導通になり、横並びで繋がる
    let board = createBoard(6, 8)
    board = placeBlock(board, 'wire-i', { row: 0, col: 0 })
    board = placeBlock(board, 'wire-i', { row: 0, col: 1 })
    const [a, b] = board.placements.map((p) => p.blockId)
    board = rotateBlock(board, a)
    board = rotateBlock(board, b)

    const nets = buildNets(board)

    const joined = nets.find((n) => n.terminals.length === 4)
    expect(joined).toBeDefined()
  })

  test('keeps separated terminals of a transistor in different nets', () => {
    const board = placeBlock(createBoard(6, 8), 'transistor-npn', {
      row: 0,
      col: 0,
    })

    const nets = buildNets(board)

    // N / E / S は内部で導通しない → 3 つの独立ネット
    expect(nets).toHaveLength(3)
    expect(nets.every((n) => n.terminals.length === 1)).toBe(true)
  })
})
