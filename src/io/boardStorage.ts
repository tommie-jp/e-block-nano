import type { Board } from '../core/grid/types'
import {
  BoardFileError,
  deserializeBoard,
  serializeBoard,
} from '../core/persistence/boardFile'

/**
 * 盤面の保存/読込 I/O (ブラウザ境界)。
 * 純粋な直列化・検証は core/persistence にあり、ここは localStorage と
 * ファイル入出力のグルーだけを持つ。
 */

const STORAGE_KEY = 'e-block-nano:board'
const DEFAULT_FILENAME = 'e-block-nano-board.json'

export const saveToLocal = (board: Board): void => {
  localStorage.setItem(STORAGE_KEY, serializeBoard(board))
}

/** 保存が無ければ null。壊れていれば BoardFileError */
export const loadFromLocal = (): Board | null => {
  const text = localStorage.getItem(STORAGE_KEY)
  return text === null ? null : deserializeBoard(text)
}

export const hasLocalSave = (): boolean =>
  localStorage.getItem(STORAGE_KEY) !== null

/** 盤面を JSON ファイルとしてダウンロードさせる */
export const downloadBoard = (
  board: Board,
  filename: string = DEFAULT_FILENAME,
): void => {
  const blob = new Blob([serializeBoard(board)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** 選択された JSON ファイルを検証して盤面へ復元する */
export const readBoardFile = async (file: File): Promise<Board> => {
  const text = await file.text()
  return deserializeBoard(text)
}

export { BoardFileError }
