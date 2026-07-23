import { describe, expect, test } from 'vitest'
import {
  createBoard,
  placeBlock,
  toggleSwitch,
} from '../grid/board'
import {
  BOARD_FILE_VERSION,
  BoardFileError,
  deserializeBoard,
  serializeBoard,
} from './boardFile'

const sampleBoard = () => {
  let board = createBoard(6, 8)
  board = placeBlock(board, 'battery-3v', { row: 0, col: 0 })
  board = placeBlock(board, 'switch', { row: 1, col: 0 })
  board = placeBlock(board, 'resistor-1k', { row: 2, col: 0 })
  const switchId = board.placements[1].blockId
  board = toggleSwitch(board, switchId) // closed=true を含める
  return board
}

describe('boardFile round-trip', () => {
  test('serialize then deserialize preserves placements and state', () => {
    const board = sampleBoard()

    const restored = deserializeBoard(serializeBoard(board))

    expect(restored.rows).toBe(board.rows)
    expect(restored.cols).toBe(board.cols)
    expect(restored.placements).toHaveLength(3)
    // partId / cell / orientation / state が保たれる
    const restoredSwitch = restored.placements.find(
      (p) => p.partId === 'switch',
    )
    expect(restoredSwitch?.cell).toEqual({ row: 1, col: 0 })
    expect(restoredSwitch?.state?.closed).toBe(true)
  })

  test('assigns fresh block ids that do not collide with new placements', () => {
    const restored = deserializeBoard(serializeBoard(sampleBoard()))
    const next = placeBlock(restored, 'wire-i', { row: 5, col: 5 })

    const ids = next.placements.map((p) => p.blockId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('serialized form omits internal block ids', () => {
    const text = serializeBoard(sampleBoard())
    expect(text).not.toContain('blockId')
    expect(JSON.parse(text).version).toBe(BOARD_FILE_VERSION)
  })
})

describe('boardFile validation (system boundary)', () => {
  test('rejects malformed JSON', () => {
    expect(() => deserializeBoard('{ not json')).toThrow(BoardFileError)
  })

  test('rejects an unsupported version', () => {
    const text = JSON.stringify({ version: 999, rows: 6, cols: 8, placements: [] })
    expect(() => deserializeBoard(text)).toThrow(/バージョン/)
  })

  test('rejects an unknown partId', () => {
    const text = JSON.stringify({
      version: BOARD_FILE_VERSION,
      rows: 6,
      cols: 8,
      placements: [{ partId: 'ghost', cell: { row: 0, col: 0 }, orientation: 0 }],
    })
    expect(() => deserializeBoard(text)).toThrow(/unknown part/)
  })

  test('rejects an out-of-bounds cell', () => {
    const text = JSON.stringify({
      version: BOARD_FILE_VERSION,
      rows: 6,
      cols: 8,
      placements: [
        { partId: 'wire-i', cell: { row: 9, col: 0 }, orientation: 0 },
      ],
    })
    expect(() => deserializeBoard(text)).toThrow(/盤面外/)
  })

  test('rejects an invalid orientation', () => {
    const text = JSON.stringify({
      version: BOARD_FILE_VERSION,
      rows: 6,
      cols: 8,
      placements: [
        { partId: 'wire-i', cell: { row: 0, col: 0 }, orientation: 45 },
      ],
    })
    expect(() => deserializeBoard(text)).toThrow(/orientation/)
  })

  test('rejects two placements on the same cell', () => {
    const text = JSON.stringify({
      version: BOARD_FILE_VERSION,
      rows: 6,
      cols: 8,
      placements: [
        { partId: 'wire-i', cell: { row: 0, col: 0 }, orientation: 0 },
        { partId: 'wire-l', cell: { row: 0, col: 0 }, orientation: 0 },
      ],
    })
    expect(() => deserializeBoard(text)).toThrow(/複数の部品/)
  })
})
