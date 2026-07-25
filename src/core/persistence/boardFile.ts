import { boardFromPlacements } from '../grid/board'
import { isInside, isSameCell } from '../grid/types'
import type {
  Board,
  Cell,
  Orientation,
  Placement,
  PlacementState,
} from '../grid/types'
import { getPart } from '../parts/catalog'

/** セーブファイルのスキーマ版。破壊的変更のたびに上げる */
export const BOARD_FILE_VERSION = 1

const ORIENTATIONS: readonly Orientation[] = [0, 90, 180, 270]

/** 検証失敗は境界での不正入力。呼び出し側で UI メッセージに変換する */
export class BoardFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardFileError'
  }
}

/**
 * 盤面を versioned JSON 文字列へ直列化する。
 * blockId は保存しない (読み込み時に振り直す。外部から参照されない内部 ID)。
 */
export const serializeBoard = (board: Board): string =>
  JSON.stringify(
    {
      version: BOARD_FILE_VERSION,
      rows: board.rows,
      cols: board.cols,
      placements: board.placements.map((p) => ({
        partId: p.partId,
        cell: { row: p.cell.row, col: p.cell.col },
        orientation: p.orientation,
        ...(p.state ? { state: p.state } : {}),
      })),
    },
    null,
    2,
  )

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const asPositiveInt = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new BoardFileError(`${field} は正の整数である必要があります`)
  }
  return v
}

const asIndex = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new BoardFileError(`${field} は 0 以上の整数が必要です`)
  }
  return v
}

const asPercent = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
    throw new BoardFileError(`${field} は 0〜100 の数値が必要です`)
  }
  return v
}

/**
 * 実行時状態を検証する。既知のフィールドだけを拾い直すので、未知のキーは落ちる。
 * どのフィールドも無ければ undefined (state 自体を持たせない)。
 */
const parseState = (v: unknown): PlacementState | undefined => {
  if (v === undefined) return undefined
  if (!isObject(v)) throw new BoardFileError('state はオブジェクトが必要です')
  if (v.closed !== undefined && typeof v.closed !== 'boolean') {
    throw new BoardFileError('state.closed は真偽値が必要です')
  }

  const state: PlacementState = {
    ...(v.closed === undefined ? {} : { closed: v.closed }),
    ...(v.wiperPct === undefined
      ? {}
      : { wiperPct: asPercent(v.wiperPct, 'state.wiperPct') }),
  }
  return Object.keys(state).length === 0 ? undefined : state
}

const parsePlacement = (
  v: unknown,
  bounds: Board,
): Omit<Placement, 'blockId'> => {
  if (!isObject(v)) throw new BoardFileError('placement はオブジェクトが必要です')

  if (typeof v.partId !== 'string' || v.partId.length === 0) {
    throw new BoardFileError('partId が不正です')
  }
  getPart(v.partId) // 未知の partId は throw

  if (!isObject(v.cell)) throw new BoardFileError('cell が不正です')
  const cell: Cell = {
    row: asIndex(v.cell.row, 'cell.row'),
    col: asIndex(v.cell.col, 'cell.col'),
  }
  if (!isInside(bounds, cell)) {
    throw new BoardFileError(`cell (${cell.row}, ${cell.col}) は盤面外です`)
  }

  if (!ORIENTATIONS.includes(v.orientation as Orientation)) {
    throw new BoardFileError(`orientation が不正です: ${String(v.orientation)}`)
  }

  const state = parseState(v.state)
  return {
    partId: v.partId,
    cell,
    orientation: v.orientation as Orientation,
    ...(state ? { state } : {}),
  }
}

/**
 * versioned JSON 文字列を検証して盤面へ復元する (システム境界での入力検証)。
 * 不正な形・未知の部品・盤面外・重複セルは BoardFileError で失敗する。
 */
export const deserializeBoard = (text: string): Board => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BoardFileError('JSON として解釈できません')
  }

  if (!isObject(raw)) throw new BoardFileError('トップレベルがオブジェクトではありません')
  if (raw.version !== BOARD_FILE_VERSION) {
    throw new BoardFileError(`未対応のバージョンです: ${String(raw.version)}`)
  }

  const rows = asPositiveInt(raw.rows, 'rows')
  const cols = asPositiveInt(raw.cols, 'cols')
  if (!Array.isArray(raw.placements)) {
    throw new BoardFileError('placements は配列が必要です')
  }

  const bounds: Board = { rows, cols, placements: [] }
  const parsed = raw.placements.map((p) => parsePlacement(p, bounds))

  parsed.forEach((a, i) => {
    if (parsed.some((b, j) => j < i && isSameCell(a.cell, b.cell))) {
      throw new BoardFileError(
        `セル (${a.cell.row}, ${a.cell.col}) に複数の部品があります`,
      )
    }
  })

  return boardFromPlacements(rows, cols, parsed)
}
