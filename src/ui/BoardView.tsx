import { useCallback, useRef, useState } from 'react'
import type { PointerEvent, ReactElement } from 'react'
import { isInside } from '../core/grid/types'
import type { Board, Cell, Placement } from '../core/grid/types'
import type { Netlist } from '../core/netlist/build'
import { getPart } from '../core/parts/catalog'
import { BlockGlyph } from '../render/BlockGlyph'
import { CELL_SIZE } from '../render/constants'
import { diffPick, pickProbe } from './scope/probePick'
import type { ProbePick } from './scope/probePick'
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
  /**
   * プローブモード (LTspice の回路図プローブ相当)。ON の間は編集操作
   * (配置/移動/選択) を止め、接点=電圧・素子=電流を当てる操作に切り替える。
   */
  probing?: boolean
  /** プローブモードのヒットテストに使う回路 (辺 → ノードの逆引き) */
  netlist?: Netlist
  /** 接点/素子にプローブを当てた (トグル) */
  onProbe?: (pick: ProbePick) => void
  /** 接点 → 接点のドラッグ = 差動電圧 V(a)−V(b) */
  onProbeDiff?: (pair: { a: string; b: string }) => void
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
  probing = false,
  netlist,
  onProbe,
  onProbeDiff,
}: BoardViewProps): ReactElement => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverPick, setHoverPick] = useState<ProbePick | null>(null)
  const [probeFrom, setProbeFrom] = useState<ProbePick | null>(null)

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

  /** プローブモードの当たり判定。netlist が無ければ当たらない */
  const pickAt = useCallback(
    (pt: { x: number; y: number }, alt = false): ProbePick | null =>
      netlist ? pickProbe(board, netlist, pt, { alt }) : null,
    [board, netlist],
  )

  const handleProbeDown = (e: PointerEvent): void => {
    const pt = toSvgPoint(e)
    svgRef.current?.setPointerCapture(e.pointerId)
    setProbeFrom(pickAt(pt, e.altKey))
  }

  const handleProbeUp = (e: PointerEvent): void => {
    const pick = pickAt(toSvgPoint(e), e.altKey)
    // 接点 → 別接点のドラッグなら差動、それ以外は当てた 1 点のトグル
    const pair = diffPick(probeFrom, pick)
    if (pair) onProbeDiff?.(pair)
    else if (pick) onProbe?.(pick)
    setProbeFrom(null)
  }

  const handleBlockPointerDown = (e: PointerEvent, p: Placement): void => {
    e.stopPropagation()
    if (probing) {
      handleProbeDown(e)
      return
    }
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
    if (probing) {
      setHoverPick(pickAt(toSvgPoint(e), e.altKey))
      return
    }
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

  const handlePointerUp = (e: PointerEvent): void => {
    if (probing) {
      handleProbeUp(e)
      return
    }
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
    if (probing) {
      handleProbeDown(e)
      return
    }
    const pt = toSvgPoint(e)
    onCellClick(cellFromPoint(pt.x, pt.y))
  }

  // プローブモードのホバー表示: 接点なら電圧 (V)、素子セルなら電流 (I)
  const hoverContact = hoverPick?.kind === 'node' ? probePoint(hoverPick.edge) : null
  const fromContact = probeFrom?.kind === 'node' ? probePoint(probeFrom.edge) : null
  const hoverCell =
    hoverPick?.kind === 'current' || hoverPick?.kind === 'power'
      ? board.placements.find((p) => p.blockId === hoverPick.blockId)?.cell
      : undefined
  const draggingDiff =
    fromContact !== null &&
    hoverContact !== null &&
    probeFrom?.kind === 'node' &&
    hoverPick?.kind === 'node' &&
    probeFrom.edge !== hoverPick.edge

  return (
    <svg
      ref={svgRef}
      className={probing ? 'board probing' : 'board'}
      viewBox={`0 0 ${width} ${height}`}
      onPointerDown={handleBackgroundClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoverPick(null)}
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
            // プローブ中はブロックを測る操作なので、編集 (回転) は起こさない
            onDoubleClick={() => !probing && onBlockDoubleClick(p.blockId)}
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
      {/* プローブモードのヒット表示 (LTspice のプローブカーソル相当) */}
      {probing && (
        <g className="probe-hit-layer">
          {draggingDiff && (
            <line
              className="probe-hit-link"
              x1={fromContact.x}
              y1={fromContact.y}
              x2={hoverContact.x}
              y2={hoverContact.y}
            />
          )}
          {fromContact && (
            <circle
              className="probe-hit from"
              cx={fromContact.x}
              cy={fromContact.y}
              r={9}
            />
          )}
          {hoverContact && (
            <g transform={`translate(${hoverContact.x}, ${hoverContact.y})`}>
              <circle className="probe-hit node" r={11} />
              <text className="probe-hit-label" x={14} y={5}>
                V
              </text>
            </g>
          )}
          {hoverCell && (
            <g
              transform={`translate(${hoverCell.col * CELL_SIZE}, ${hoverCell.row * CELL_SIZE})`}
            >
              <rect
                className="probe-hit current"
                x={4}
                y={4}
                width={CELL_SIZE - 8}
                height={CELL_SIZE - 8}
                rx={5}
              />
              <text className="probe-hit-label" x={CELL_SIZE - 16} y={CELL_SIZE - 8}>
                {hoverPick?.kind === 'power' ? 'P' : 'I'}
              </text>
            </g>
          )}
        </g>
      )}
      {/* 波形に出ているノードの位置に、波形と同色の●を重ねる (色=ノードの対応) */}
      {probes && probes.length > 0 && (
        <g className="probe-layer">
          {probes.map((probe) => {
            const pt = probePoint(probe.nodeId)
            if (!pt) return null
            return (
              <g
                key={probe.nodeId}
                transform={`translate(${pt.x}, ${pt.y})`}
                className={probe.constant ? 'probe constant' : 'probe'}
              >
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
