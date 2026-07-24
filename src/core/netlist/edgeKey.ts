import type { Cell } from '../grid/types'
import type { Direction } from '../parts/types'

/**
 * セルの辺 (接点位置) を盤面全体で一意なキーにする。
 * 隣接セルは境界の辺を共有する → 同じキーになり、そこがノードになる (辺中央接点)。
 * `H:row,col` = 行境界 row の水平辺 (セル col の上辺)、
 * `V:row,col` = 列境界 col の垂直辺 (セル row の左辺)。
 * nodeId (union-find の代表) も必ずこの形式なので、逆変換で盤面座標に戻せる。
 */
export const edgeKey = (cell: Cell, dir: Direction): string => {
  switch (dir) {
    case 'N':
      return `H:${cell.row},${cell.col}`
    case 'S':
      return `H:${cell.row + 1},${cell.col}`
    case 'W':
      return `V:${cell.row},${cell.col}`
    case 'E':
      return `V:${cell.row},${cell.col + 1}`
  }
}

export interface ParsedEdge {
  readonly axis: 'H' | 'V'
  readonly row: number
  readonly col: number
}

/** `edgeKey` の逆変換。不正な文字列は null。 */
export const parseEdgeKey = (key: string): ParsedEdge | null => {
  const m = /^([HV]):(\d+),(\d+)$/.exec(key)
  if (!m) return null
  return { axis: m[1] as 'H' | 'V', row: Number(m[2]), col: Number(m[3]) }
}
