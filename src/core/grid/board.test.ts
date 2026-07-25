import { describe, expect, test } from 'vitest'
import {
  blockAt,
  createBoard,
  isPotentiometer,
  isSwitch,
  moveBlock,
  placeBlock,
  removeBlock,
  rotateBlock,
  setWiperPct,
  toggleSwitch,
} from './board'

describe('board operations (immutable)', () => {
  test('places a block on an empty cell', () => {
    // Arrange
    const board = createBoard(6, 8)

    // Act
    const next = placeBlock(board, 'resistor-1k', { row: 1, col: 2 })

    // Assert
    expect(next).not.toBe(board)
    expect(board.placements).toHaveLength(0)
    expect(next.placements).toHaveLength(1)
    expect(next.placements[0].partId).toBe('resistor-1k')
    expect(next.placements[0].orientation).toBe(0)
  })

  test('rejects placement on an occupied cell', () => {
    const board = placeBlock(createBoard(6, 8), 'wire-i', { row: 0, col: 0 })

    expect(() => placeBlock(board, 'wire-l', { row: 0, col: 0 })).toThrow(
      /occupied/,
    )
  })

  test('rejects placement outside the board', () => {
    const board = createBoard(6, 8)

    expect(() => placeBlock(board, 'wire-i', { row: 6, col: 0 })).toThrow(
      /outside/,
    )
  })

  test('moves a block to an empty cell without mutating the original', () => {
    const board = placeBlock(createBoard(6, 8), 'wire-i', { row: 0, col: 0 })
    const id = board.placements[0].blockId

    const next = moveBlock(board, id, { row: 3, col: 4 })

    expect(board.placements[0].cell).toEqual({ row: 0, col: 0 })
    expect(next.placements[0].cell).toEqual({ row: 3, col: 4 })
  })

  test('rejects a move onto another block', () => {
    let board = createBoard(6, 8)
    board = placeBlock(board, 'wire-i', { row: 0, col: 0 })
    board = placeBlock(board, 'wire-l', { row: 0, col: 1 })
    const id = board.placements[0].blockId

    expect(() => moveBlock(board, id, { row: 0, col: 1 })).toThrow(/occupied/)
  })

  test('rotates a block by 90 degrees steps, wrapping at 360', () => {
    const board = placeBlock(createBoard(6, 8), 'wire-l', { row: 2, col: 2 })
    const id = board.placements[0].blockId

    const r1 = rotateBlock(board, id)
    const r4 = rotateBlock(rotateBlock(rotateBlock(r1, id), id), id)

    expect(r1.placements[0].orientation).toBe(90)
    expect(r4.placements[0].orientation).toBe(0)
  })

  test('removes a block', () => {
    const board = placeBlock(createBoard(6, 8), 'wire-i', { row: 0, col: 0 })
    const id = board.placements[0].blockId

    const next = removeBlock(board, id)

    expect(next.placements).toHaveLength(0)
    expect(board.placements).toHaveLength(1)
  })

  test('finds the block occupying a cell', () => {
    const board = placeBlock(createBoard(6, 8), 'wire-i', { row: 2, col: 5 })

    expect(blockAt(board, { row: 2, col: 5 })?.partId).toBe('wire-i')
    expect(blockAt(board, { row: 0, col: 0 })).toBeUndefined()
  })

  test('toggles a switch open <-> closed without mutating the original', () => {
    const board = placeBlock(createBoard(6, 8), 'switch', { row: 0, col: 0 })
    const id = board.placements[0].blockId
    expect(board.placements[0].state?.closed ?? false).toBe(false)

    const closed = toggleSwitch(board, id)
    expect(closed.placements[0].state?.closed).toBe(true)
    expect(board.placements[0].state?.closed ?? false).toBe(false)

    const reopened = toggleSwitch(closed, id)
    expect(reopened.placements[0].state?.closed).toBe(false)
  })

  test('可変抵抗のワイパ位置を設定する (元の board は不変)', () => {
    const board = placeBlock(createBoard(6, 8), 'potentiometer-100k', {
      row: 0,
      col: 0,
    })
    const id = board.placements[0].blockId

    const turned = setWiperPct(board, id, 30)
    expect(turned.placements[0].state?.wiperPct).toBe(30)
    expect(board.placements[0].state?.wiperPct).toBeUndefined()
  })

  test('ワイパ位置は 0〜100 にクリップする (電気的な下限は wiperOhms が見る)', () => {
    const board = placeBlock(createBoard(6, 8), 'potentiometer-100k', {
      row: 0,
      col: 0,
    })
    const id = board.placements[0].blockId

    expect(setWiperPct(board, id, 250).placements[0].state?.wiperPct).toBe(100)
    expect(setWiperPct(board, id, -5).placements[0].state?.wiperPct).toBe(0)
  })

  test('ワイパ位置の設定は他の state を壊さない', () => {
    let board = placeBlock(createBoard(6, 8), 'potentiometer-100k', {
      row: 0,
      col: 0,
    })
    board = placeBlock(board, 'switch', { row: 1, col: 0 })
    const potId = board.placements[0].blockId
    const swId = board.placements[1].blockId

    const next = setWiperPct(toggleSwitch(board, swId), potId, 80)
    expect(next.placements[0].state?.wiperPct).toBe(80)
    expect(next.placements[1].state?.closed).toBe(true)
  })

  test('可変抵抗以外へのワイパ設定は no-op', () => {
    const board = placeBlock(createBoard(6, 8), 'resistor-1k', { row: 0, col: 0 })
    const id = board.placements[0].blockId

    expect(setWiperPct(board, id, 30).placements[0].state).toBeUndefined()
  })

  test('isPotentiometer は可変抵抗だけ true', () => {
    let board = placeBlock(createBoard(6, 8), 'potentiometer-100k', {
      row: 0,
      col: 0,
    })
    board = placeBlock(board, 'resistor-1k', { row: 1, col: 0 })

    expect(isPotentiometer(board, board.placements[0].blockId)).toBe(true)
    expect(isPotentiometer(board, board.placements[1].blockId)).toBe(false)
  })

  test('toggling a non-switch block is a no-op', () => {
    const board = placeBlock(createBoard(6, 8), 'resistor-1k', {
      row: 0,
      col: 0,
    })
    const id = board.placements[0].blockId

    const next = toggleSwitch(board, id)

    expect(next.placements[0].state).toBeUndefined()
  })

  test('isSwitch reports switch blocks only', () => {
    let board = placeBlock(createBoard(6, 8), 'switch', { row: 0, col: 0 })
    board = placeBlock(board, 'resistor-1k', { row: 0, col: 1 })
    const [sw, res] = board.placements.map((p) => p.blockId)

    expect(isSwitch(board, sw)).toBe(true)
    expect(isSwitch(board, res)).toBe(false)
    expect(isSwitch(board, 'nope')).toBe(false)
  })
})
