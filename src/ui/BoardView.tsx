import { useCallback, useRef, useState } from 'react'
import type { PointerEvent, ReactElement } from 'react'
import { isInside } from '../core/grid/types'
import type { Board, Cell, Placement } from '../core/grid/types'
import { getPart } from '../core/parts/catalog'
import { BlockGlyph } from '../render/BlockGlyph'
import { CELL_SIZE } from '../render/constants'
import type { NodeProbe } from './waveProbes'
import { probePoint } from './waveProbes'

// これ未満はクリック (選択) 扱い。指はマウスより不正確なので大きめ
const DRAG_THRESHOLD_MOUSE_PX = 5
const DRAG_THRESHOLD_TOUCH_PX = 12

const CELL_CENTER = CELL_SIZE / 2

interface DragState {
  blockId: string
  originCol: number
  originRow: number
  startX: number
  startY: number
  dx: number
  dy: number
  moved: boolean
  isTouch: boolean
}

interface BoardViewProps {
  board: Board
  selectedBlockId: string | null
  onCellClick: (cell: Cell) => void
  onBlockMove: (blockId: string, to: Cell) => void
  onBlockDoubleClick: (blockId: string) => void
  /** blockId → 素子電流 [A] (ngspice 計算後。LED 点灯表現に使う) */
  elementCurrents?: Readonly<Record<string, number>>
  /** 波形表示中のノード。位置に色つき●を重ねて波形の色と対応づける */
  probes?: readonly NodeProbe[]
}

/** グリッドとブロックの SVG 表示。ドラッグでブロック移動 */
export const BoardView = ({
  board,
  selectedBlockId,
  onCellClick,
  onBlockMove,
  onBlockDoubleClick,
  elementCurrents,
  probes,
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

  /** ドラッグ中のブロック中心が今いるセル (着地先) */
  const dropCellFromDrag = useCallback(
    (d: DragState): Cell =>
      cellFromPoint(
        d.originCol * CELL_SIZE + d.dx + CELL_CENTER,
        d.originRow * CELL_SIZE + d.dy + CELL_CENTER,
      ),
    [cellFromPoint],
  )

  const handleBlockPointerDown = (e: PointerEvent, p: Placement): void => {
    e.stopPropagation()
    const pt = toSvgPoint(e)
    svgRef.current?.setPointerCapture(e.pointerId)
    setDrag({
      blockId: p.blockId,
      originCol: p.cell.col,
      originRow: p.cell.row,
      startX: pt.x,
      startY: pt.y,
      dx: 0,
      dy: 0,
      moved: false,
      isTouch: e.pointerType === 'touch',
    })
  }

  const handlePointerMove = (e: PointerEvent): void => {
    if (!drag) return
    const pt = toSvgPoint(e)
    const dx = pt.x - drag.startX
    const dy = pt.y - drag.startY
    const threshold = drag.isTouch
      ? DRAG_THRESHOLD_TOUCH_PX
      : DRAG_THRESHOLD_MOUSE_PX
    const moved = drag.moved || Math.hypot(dx, dy) >= threshold
    setDrag({ ...drag, dx, dy, moved })
  }

  const handlePointerUp = (): void => {
    if (!drag) return
    if (drag.moved) {
      // 指で隠れる指位置ではなく、見えているブロック中心を着地先にする
      onBlockMove(drag.blockId, dropCellFromDrag(drag))
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
      {/* ドラッグ中の着地先ハイライト (指でブロックが隠れても位置が分かる) */}
      {drag?.moved &&
        (() => {
          const target = dropCellFromDrag(drag)
          if (!isInside(board, target)) return null
          return (
            <rect
              className="drop-target"
              x={target.col * CELL_SIZE}
              y={target.row * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
            />
          )
        })()}
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
              closed={p.state?.closed ?? false}
              current={elementCurrents?.[p.blockId]}
            />
          </g>
        )
      })}
      {/* 波形に出ているノードの位置に、波形と同色の●を重ねる (色=ノードの対応) */}
      {probes && probes.length > 0 && (
        <g className="probe-layer">
          {probes.map((probe) => {
            const pt = probePoint(probe.nodeId)
            if (!pt) return null
            return (
              <g key={probe.nodeId} transform={`translate(${pt.x}, ${pt.y})`}>
                <circle className="probe-dot" r={6} fill={probe.color} />
                <text className="probe-label" x={9} y={4}>
                  {probe.label}
                </text>
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}
