import { useCallback, useRef, useState } from 'react'
import type { PointerEvent, ReactElement } from 'react'
import type { Board, Cell, Placement } from '../core/grid/types'
import { getPart } from '../core/parts/catalog'
import { BlockGlyph } from '../render/BlockGlyph'
import { CELL_SIZE } from '../render/constants'

const DRAG_THRESHOLD_PX = 5 // これ未満はクリック (選択) 扱い

interface DragState {
  blockId: string
  startX: number
  startY: number
  dx: number
  dy: number
  moved: boolean
}

interface BoardViewProps {
  board: Board
  selectedBlockId: string | null
  onCellClick: (cell: Cell) => void
  onBlockMove: (blockId: string, to: Cell) => void
  onBlockDoubleClick: (blockId: string) => void
}

/** グリッドとブロックの SVG 表示。ドラッグでブロック移動 */
export const BoardView = ({
  board,
  selectedBlockId,
  onCellClick,
  onBlockMove,
  onBlockDoubleClick,
}: BoardViewProps): ReactElement => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const width = board.cols * CELL_SIZE
  const height = board.rows * CELL_SIZE

  /** クライアント座標 → SVG viewBox 座標 */
  const toSvgPoint = useCallback((e: PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }, [width, height])

  const cellFromPoint = useCallback(
    (x: number, y: number): Cell => ({
      row: Math.floor(y / CELL_SIZE),
      col: Math.floor(x / CELL_SIZE),
    }),
    [],
  )

  const handleBlockPointerDown = (e: PointerEvent, p: Placement): void => {
    e.stopPropagation()
    const pt = toSvgPoint(e)
    svgRef.current?.setPointerCapture(e.pointerId)
    setDrag({
      blockId: p.blockId,
      startX: pt.x,
      startY: pt.y,
      dx: 0,
      dy: 0,
      moved: false,
    })
  }

  const handlePointerMove = (e: PointerEvent): void => {
    if (!drag) return
    const pt = toSvgPoint(e)
    const dx = pt.x - drag.startX
    const dy = pt.y - drag.startY
    const moved = drag.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX
    setDrag({ ...drag, dx, dy, moved })
  }

  const handlePointerUp = (e: PointerEvent): void => {
    if (!drag) return
    const pt = toSvgPoint(e)
    if (drag.moved) {
      onBlockMove(drag.blockId, cellFromPoint(pt.x, pt.y))
    } else {
      // クリック扱い → 選択トグルはセルクリックに委譲
      onCellClick(cellFromPoint(drag.startX, drag.startY))
    }
    setDrag(null)
  }

  const handleBackgroundClick = (e: PointerEvent): void => {
    const pt = toSvgPoint(e)
    onCellClick(cellFromPoint(pt.x, pt.y))
  }

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={`0 0 ${width} ${height}`}
      onPointerDown={handleBackgroundClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* グリッド線 */}
      {Array.from({ length: board.rows + 1 }, (_, r) => (
        <line key={`h${r}`} x1={0} y1={r * CELL_SIZE} x2={width} y2={r * CELL_SIZE} className="grid-line" />
      ))}
      {Array.from({ length: board.cols + 1 }, (_, c) => (
        <line key={`v${c}`} x1={c * CELL_SIZE} y1={0} x2={c * CELL_SIZE} y2={height} className="grid-line" />
      ))}
      {/* セル座標ラベル (A1 形式) */}
      {Array.from({ length: board.rows }, (_, r) =>
        Array.from({ length: board.cols }, (_, c) => (
          <text
            key={`l${r}-${c}`}
            x={c * CELL_SIZE + 4}
            y={r * CELL_SIZE + 12}
            className="cell-label"
          >
            {String.fromCharCode(65 + r)}
            {c + 1}
          </text>
        )),
      )}
      {/* ブロック */}
      {board.placements.map((p) => {
        const isDragging = drag?.moved && drag.blockId === p.blockId
        const tx = p.cell.col * CELL_SIZE + (isDragging ? drag.dx : 0)
        const ty = p.cell.row * CELL_SIZE + (isDragging ? drag.dy : 0)
        return (
          <g
            key={p.blockId}
            transform={`translate(${tx}, ${ty})`}
            className={isDragging ? 'block dragging' : 'block'}
            onPointerDown={(e) => handleBlockPointerDown(e, p)}
            onDoubleClick={() => onBlockDoubleClick(p.blockId)}
          >
            <BlockGlyph
              part={getPart(p.partId)}
              orientation={p.orientation}
              selected={p.blockId === selectedBlockId}
            />
          </g>
        )
      })}
    </svg>
  )
}
