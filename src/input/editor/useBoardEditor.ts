import { useCallback, useMemo, useState } from 'react'
import {
  blockAt,
  createBoard,
  moveBlock,
  placeBlock,
  removeBlock,
  rotateBlock,
} from '../../core/grid/board'
import type { Board, Cell } from '../../core/grid/types'

export interface BoardEditor {
  board: Board
  selectedPartId: string | null
  selectedBlockId: string | null
  message: string | null
  selectPart: (partId: string | null) => void
  selectBlock: (blockId: string | null) => void
  handleCellClick: (cell: Cell) => void
  handleBlockMove: (blockId: string, to: Cell) => void
  rotateSelected: () => void
  rotateBlockById: (blockId: string) => void
  removeSelected: () => void
}

/**
 * 画面エディタの状態と操作 (入力アダプタ)。
 * コアの純関数を包み、無効操作はメッセージとして表面化する。
 */
export const useBoardEditor = (rows: number, cols: number): BoardEditor => {
  const initial = useMemo(() => createBoard(rows, cols), [rows, cols])
  const [board, setBoard] = useState<Board>(initial)
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const apply = useCallback((op: (b: Board) => Board): void => {
    setBoard((current) => {
      try {
        const next = op(current)
        setMessage(null)
        return next
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e))
        return current
      }
    })
  }, [])

  const handleCellClick = useCallback(
    (cell: Cell): void => {
      const existing = blockAt(board, cell)
      if (existing) {
        // 配置済みブロックはクリックで選択 (もう一度で解除)
        setSelectedBlockId((id) =>
          id === existing.blockId ? null : existing.blockId,
        )
        return
      }
      if (selectedPartId) {
        apply((b) => placeBlock(b, selectedPartId, cell))
      } else {
        setSelectedBlockId(null)
      }
    },
    [apply, board, selectedPartId],
  )

  const handleBlockMove = useCallback(
    (blockId: string, to: Cell): void => {
      apply((b) => moveBlock(b, blockId, to))
    },
    [apply],
  )

  const rotateBlockById = useCallback(
    (blockId: string): void => {
      apply((b) => rotateBlock(b, blockId))
    },
    [apply],
  )

  const rotateSelected = useCallback((): void => {
    if (selectedBlockId) rotateBlockById(selectedBlockId)
  }, [rotateBlockById, selectedBlockId])

  const removeSelected = useCallback((): void => {
    if (!selectedBlockId) return
    apply((b) => removeBlock(b, selectedBlockId))
    setSelectedBlockId(null)
  }, [apply, selectedBlockId])

  return {
    board,
    selectedPartId,
    selectedBlockId,
    message,
    selectPart: setSelectedPartId,
    selectBlock: setSelectedBlockId,
    handleCellClick,
    handleBlockMove,
    rotateSelected,
    rotateBlockById,
    removeSelected,
  }
}
