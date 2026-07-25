/** グリッド座標・配置の型定義 (層間の安定契約) */

export type Orientation = 0 | 90 | 180 | 270

export interface Cell {
  readonly row: number
  readonly col: number
}

/**
 * 配置インスタンス固有の実行時状態。
 * カメラ認識は出力しない (省略時はデフォルト扱い) — UI 操作でのみ変わる。
 * 幾何情報 (partId/cell/orientation) と分けることで配置 → netlist 境界の
 * カメラ互換性を保つ。
 */
export interface PlacementState {
  /** スイッチの開閉。true=閉 (導通)。省略時は開 (false) */
  readonly closed?: boolean
  /**
   * 可変抵抗のワイパ位置 [%] (0–100)。省略時は中央 (`WIPER_DEFAULT_PCT`)。
   * 実効抵抗への換算は `core/parts/types.ts` の `wiperOhms`。
   */
  readonly wiperPct?: number
  // 将来: バリコンの容量位置など
}

/** ブロック 1 個の配置。カメラ認識も将来これを出力する (state は除く) */
export interface Placement {
  readonly blockId: string
  readonly partId: string
  readonly cell: Cell
  readonly orientation: Orientation
  /** インスタンス状態 (スイッチ開閉など)。省略可 */
  readonly state?: PlacementState
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
