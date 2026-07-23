import type { Board, Cell, Placement } from './types'
import { isInside, isSameCell } from './types'

let nextBlockSeq = 0

/** テスト再現性のため ID は連番 (Date/random 不使用) */
const newBlockId = (): string => `blk-${++nextBlockSeq}`

export const createBoard = (rows: number, cols: number): Board => ({
  rows,
  cols,
  placements: [],
})

export const blockAt = (board: Board, cell: Cell): Placement | undefined =>
  board.placements.find((p) => isSameCell(p.cell, cell))

const assertPlaceable = (board: Board, cell: Cell): void => {
  if (!isInside(board, cell)) {
    throw new Error(`cell (${cell.row}, ${cell.col}) is outside the board`)
  }
  if (blockAt(board, cell)) {
    throw new Error(`cell (${cell.row}, ${cell.col}) is already occupied`)
  }
}

export const placeBlock = (board: Board, partId: string, cell: Cell): Board => {
  assertPlaceable(board, cell)
  const placement: Placement = {
    blockId: newBlockId(),
    partId,
    cell,
    orientation: 0,
  }
  return { ...board, placements: [...board.placements, placement] }
}

const updatePlacement = (
  board: Board,
  blockId: string,
  update: (p: Placement) => Placement,
): Board => {
  const target = board.placements.find((p) => p.blockId === blockId)
  if (!target) throw new Error(`block ${blockId} not found`)
  return {
    ...board,
    placements: board.placements.map((p) =>
      p.blockId === blockId ? update(p) : p,
    ),
  }
}

export const moveBlock = (board: Board, blockId: string, to: Cell): Board => {
  const current = board.placements.find((p) => p.blockId === blockId)
  if (current && isSameCell(current.cell, to)) return board
  assertPlaceable(board, to)
  return updatePlacement(board, blockId, (p) => ({ ...p, cell: to }))
}

export const rotateBlock = (board: Board, blockId: string): Board =>
  updatePlacement(board, blockId, (p) => ({
    ...p,
    orientation: (((p.orientation + 90) % 360) as Placement['orientation']),
  }))

export const removeBlock = (board: Board, blockId: string): Board => ({
  ...board,
  placements: board.placements.filter((p) => p.blockId !== blockId),
})
