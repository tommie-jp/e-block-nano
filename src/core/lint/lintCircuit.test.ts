import { describe, expect, test } from 'vitest'
import {
  createBoard,
  placeBlock,
  rotateBlock,
  toggleSwitch,
} from '../grid/board'
import type { Board, Cell, Orientation } from '../grid/types'
import { buildNetlist } from '../netlist/build'
import { lintCircuit } from './lintCircuit'

/** partId を指定セル・向きで置き、その blockId を返す */
const place = (
  board: Board,
  partId: string,
  cell: Cell,
  orientation: Orientation = 0,
): { board: Board; id: string } => {
  let b = placeBlock(board, partId, cell)
  const id = b.placements[b.placements.length - 1].blockId
  for (let i = 0; i < orientation / 90; i++) b = rotateBlock(b, id)
  return { board: b, id }
}

/**
 * 電池を囲む導通ループを (1,0) セルを可変部品にして組む。
 * battery(1,1) の plus(H:1,1) から左回りに (0,1)-(0,0)-(1,0)-(2,0)-(2,1) を通り
 * minus(H:2,1) へ戻る 6 セルの環。midCell の部品でループ性質が変わる。
 */
const loopAround = (
  midPartId: string,
): { board: Board; midId: string } => {
  let b = createBoard(6, 8)
  b = place(b, 'battery-3v', { row: 1, col: 1 }, 0).board
  b = place(b, 'wire-l', { row: 0, col: 1 }, 180).board // S,W
  b = place(b, 'wire-l', { row: 0, col: 0 }, 90).board // E,S
  const mid = place(b, midPartId, { row: 1, col: 0 }, 0) // N,S
  b = mid.board
  b = place(b, 'wire-l', { row: 2, col: 0 }, 0).board // N,E
  b = place(b, 'wire-l', { row: 2, col: 1 }, 270).board // W,N
  return { board: b, midId: mid.id }
}

const lintOf = (board: Board) => lintCircuit(buildNetlist(board))
const codesOf = (board: Board) => lintOf(board).map((f) => f.code)

describe('lintCircuit', () => {
  test('empty board has no findings', () => {
    expect(lintOf(createBoard(6, 8))).toHaveLength(0)
  })

  test('a component without a battery is a no-battery error plus floating pins', () => {
    const { board } = place(createBoard(6, 8), 'resistor-1k', { row: 2, col: 2 })

    const codes = codesOf(board)

    expect(codes).toContain('no-battery')
    expect(lintOf(board).find((f) => f.code === 'no-battery')?.severity).toBe(
      'error',
    )
    // 抵抗の両端は浮いている
    expect(codes.filter((c) => c === 'floating-pin')).toHaveLength(2)
  })

  test('a lone battery reports its two floating terminals, no short', () => {
    const { board } = place(createBoard(6, 8), 'battery-3v', { row: 1, col: 1 })

    const codes = codesOf(board)

    expect(codes.filter((c) => c === 'floating-pin')).toHaveLength(2)
    expect(codes).not.toContain('battery-short')
    expect(codes).not.toContain('no-battery')
  })

  test('a battery shorted by wires is a battery-short error', () => {
    const { board } = loopAround('wire-i')

    const short = lintOf(board).find((f) => f.code === 'battery-short')

    expect(short).toBeDefined()
    expect(short?.severity).toBe('error')
  })

  test('a switch decides the short: open = no short, closed = short', () => {
    const open = loopAround('switch')
    expect(codesOf(open.board)).not.toContain('battery-short')

    const closed = toggleSwitch(open.board, open.midId)
    expect(codesOf(closed)).toContain('battery-short')
  })

  test('an element off the powered loop is unpowered, not double-reported as floating', () => {
    // 電池 + LED の閉ループ (短絡なし・浮きなし) に、離れた抵抗を 1 個置く
    let { board } = loopAround('led-red')
    const stray = place(board, 'resistor-1k', { row: 5, col: 5 })
    board = stray.board

    const findings = lintOf(board)
    const unpowered = findings.filter((f) => f.code === 'unpowered-element')

    expect(unpowered).toHaveLength(1)
    expect(unpowered[0].blockIds).toContain(stray.id)
    // 電源ループ側は健全: 短絡なし・浮きなし
    expect(findings.map((f) => f.code)).not.toContain('battery-short')
    expect(findings.map((f) => f.code)).not.toContain('floating-pin')
  })
})
