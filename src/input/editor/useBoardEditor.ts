import { useCallback, useMemo, useState } from 'react'
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
} from '../../core/grid/board'
import type { Board, Cell } from '../../core/grid/types'
import { getPart } from '../../core/parts/catalog'
import { WIPER_DEFAULT_PCT, wiperOhms } from '../../core/parts/types'

export interface BoardEditor {
  board: Board
  selectedPartId: string | null
  selectedBlockId: string | null
  /** 選択中ブロックがスイッチか (トグル操作の可否) */
  selectedIsSwitch: boolean
  /** 選択中ブロックが可変抵抗のときの現在値。それ以外は null (つまみを出さない) */
  selectedWiper: { pct: number; ohms: number } | null
  message: string | null
  selectPart: (partId: string | null) => void
  selectBlock: (blockId: string | null) => void
  handleCellClick: (cell: Cell) => void
  handleBlockMove: (blockId: string, to: Cell) => void
  rotateSelected: () => void
  rotateBlockById: (blockId: string) => void
  toggleSelected: () => void
  /** 選択中の可変抵抗のワイパ位置を設定する (可変抵抗以外は無変更) */
  setSelectedWiper: (pct: number) => void
  removeSelected: () => void
  /** 盤面をまるごと差し替える (読み込み時)。選択とメッセージをクリア */
  replaceBoard: (board: Board) => void
  /** 読み込み失敗などのメッセージを表面化する */
  reportError: (message: string) => void
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

  const toggleSelected = useCallback((): void => {
    if (selectedBlockId) apply((b) => toggleSwitch(b, selectedBlockId))
  }, [apply, selectedBlockId])

  const setSelectedWiper = useCallback(
    (pct: number): void => {
      if (selectedBlockId) apply((b) => setWiperPct(b, selectedBlockId, pct))
    },
    [apply, selectedBlockId],
  )

  const removeSelected = useCallback((): void => {
    if (!selectedBlockId) return
    apply((b) => removeBlock(b, selectedBlockId))
    setSelectedBlockId(null)
  }, [apply, selectedBlockId])

  const replaceBoard = useCallback((next: Board): void => {
    setBoard(next)
    setSelectedBlockId(null)
    setMessage(null)
  }, [])

  const selectedIsSwitch =
    selectedBlockId !== null && isSwitch(board, selectedBlockId)

  /** 可変抵抗を選んでいるときだけ、いまのワイパ位置と実効抵抗を出す */
  const selectedWiper = ((): BoardEditor['selectedWiper'] => {
    if (selectedBlockId === null || !isPotentiometer(board, selectedBlockId)) {
      return null
    }
    const placement = board.placements.find((p) => p.blockId === selectedBlockId)
    const device = placement && getPart(placement.partId).device
    if (device?.kind !== 'potentiometer') return null
    const pct = placement?.state?.wiperPct ?? WIPER_DEFAULT_PCT
    return { pct, ohms: wiperOhms(device.maxOhms, pct) }
  })()

  return {
    board,
    selectedPartId,
    selectedBlockId,
    selectedIsSwitch,
    selectedWiper,
    message,
    selectPart: setSelectedPartId,
    selectBlock: setSelectedBlockId,
    handleCellClick,
    handleBlockMove,
    rotateSelected,
    rotateBlockById,
    toggleSelected,
    setSelectedWiper,
    removeSelected,
    replaceBoard,
    reportError: setMessage,
  }
}
