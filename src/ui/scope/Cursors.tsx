import type { PointerEvent, ReactElement } from 'react'
import type { Scales } from './geometry'

/** カーソル位置 (データ単位)。時間 2 本 (tA,tB) と電圧 2 本 (vA,vB) */
export interface CursorState {
  readonly tA: number
  readonly tB: number
  readonly vA: number
  readonly vB: number
}

export type CursorId = 'tA' | 'tB' | 'vA' | 'vB'

interface CursorsProps {
  scales: Scales
  cursor: CursorState
  onGrab: (id: CursorId, e: PointerEvent) => void
  /**
   * 吸着先のトレース (LTspice の Attach Cursor)。渡すと横カーソルの代わりに
   * 「その時刻のトレース上の点」を丸で示す。
   */
  attached?: { readonly color: string; readonly vA: number; readonly vB: number } | null
}

/**
 * オシロのカーソル: ドラッグできる時間 (縦) / 電圧 (横) の線。
 * ドラッグ状態と座標変換は親 (WaveformChart) が持ち、ここは描画と掴みだけ。
 */
export const Cursors = ({
  scales,
  cursor,
  onGrab,
  attached,
}: CursorsProps): ReactElement => {
  const { plot } = scales

  const timeCursor = (id: 'tA' | 'tB', t: number): ReactElement => {
    const px = scales.x(t)
    return (
      <g key={id} className="cursor cursor-time">
        <line x1={px} y1={plot.top} x2={px} y2={plot.bottom} className="cursor-line" />
        <line
          x1={px}
          y1={plot.top}
          x2={px}
          y2={plot.bottom}
          className="cursor-grab"
          onPointerDown={(e) => onGrab(id, e)}
        />
        <text x={px + 3} y={plot.top + 9} className="cursor-tag">
          {id === 'tA' ? 'A' : 'B'}
        </text>
      </g>
    )
  }

  const voltCursor = (id: 'vA' | 'vB', v: number): ReactElement => {
    const py = scales.y(v)
    return (
      <g key={id} className="cursor cursor-volt">
        <line x1={plot.left} y1={py} x2={plot.right} y2={py} className="cursor-line" />
        <line
          x1={plot.left}
          y1={py}
          x2={plot.right}
          y2={py}
          className="cursor-grab"
          onPointerDown={(e) => onGrab(id, e)}
        />
        <text x={plot.right - 3} y={py - 3} className="cursor-tag" textAnchor="end">
          {id === 'vA' ? 'A' : 'B'}
        </text>
      </g>
    )
  }

  /** 吸着中: トレース上の読み取り点 */
  const marker = (t: number, v: number, tag: string): ReactElement => (
    <g key={`m${tag}`} className="cursor-marker">
      <circle cx={scales.x(t)} cy={scales.y(v)} r={4} fill={attached?.color} />
      <text x={scales.x(t) + 6} y={scales.y(v) - 6} className="cursor-tag">
        {tag}
      </text>
    </g>
  )

  return (
    <g className="cursors">
      {timeCursor('tA', cursor.tA)}
      {timeCursor('tB', cursor.tB)}
      {attached ? (
        <>
          {marker(cursor.tA, attached.vA, 'A')}
          {marker(cursor.tB, attached.vB, 'B')}
        </>
      ) : (
        <>
          {voltCursor('vA', cursor.vA)}
          {voltCursor('vB', cursor.vB)}
        </>
      )}
    </g>
  )
}
