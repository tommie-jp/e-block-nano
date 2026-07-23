/** グリッド座標・配置の型定義 (層間の安定契約) */

export type Orientation = 0 | 90 | 180 | 270

export interface Cell {
  readonly row: number
  readonly col: number
}

/** ブロック 1 個の配置。カメラ認識も将来これを出力する */
export interface Placement {
  readonly blockId: string
  readonly partId: string
  readonly cell: Cell
  readonly orientation: Orientation
}

export interface Board {
  readonly rows: number
  readonly cols: number
  readonly placements: readonly Placement[]
}

export const isSameCell = (a: Cell, b: Cell): boolean =>
  a.row === b.row && a.col === b.col

export const isInside = (board: Board, cell: Cell): boolean =>
  cell.row >= 0 && cell.row < board.rows && cell.col >= 0 && cell.col < board.cols
