import type { PointerEvent, ReactElement, ReactNode, RefObject } from 'react'
import { unitOf } from '../../core/scope/traceExpr'
import type { Unit } from '../../core/scope/traceExpr'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { Scales } from './geometry'
import type { Pane } from './panes'
import { TimePlot } from './TimePlot'
import { UNIT_DISPLAY } from './traceSeries'
import type { DrawTrace } from './traceSeries'

/**
 * ペイン 1 枚 = 見出し (トレースの札・Y 軸設定・閉じる) ＋ 1 枚の SVG。
 * X 軸は全ペイン共通なので、時間窓・掃引は親から `scales` / `tHead` で降ってくる。
 */

interface ScopePaneProps {
  pane: Pane
  /** このペインに属するトレース (単位混在可。左軸 = 先頭の単位) */
  traces: readonly DrawTrace[]
  scales: Scales
  height: number
  time: readonly number[]
  leftUnit: Unit
  rightUnit: Unit | null
  /** 右軸のレンジ (表示単位に換算済み) */
  rightAxis?: { min: number; max: number; unit: string }
  /** 右軸トレースの値 → 表示単位の倍率 */
  rightScale: number
  sweeping: boolean
  tHead: number
  reference?: Waveforms | null
  selectedBlockId?: string | null
  /** ペインを閉じられるか (最後の 1 枚は閉じさせない) */
  canRemove: boolean
  onRemove: () => void
  /** トレースを次のペインへ送る */
  onMoveTrace: (traceKey: string) => void
  /** Y 軸: 自動 ↔ 手動。手動のときは min/max を数値で受け取る */
  onSetYRange: (range: { min: number; max: number } | null) => void
  /** SVG の中に重ねる追加要素 (カーソル・ステータス表示など) */
  overlay?: ReactNode
  /** カーソル操作用 (この SVG 上でドラッグする先頭ペインだけ渡す) */
  svgRef?: RefObject<SVGSVGElement | null>
  onPointerMove?: (e: PointerEvent) => void
  onPointerUp?: () => void
}

export const ScopePane = ({
  pane,
  traces,
  scales,
  height,
  time,
  leftUnit,
  rightUnit,
  rightAxis,
  rightScale,
  sweeping,
  tHead,
  reference,
  selectedBlockId,
  canRemove,
  onRemove,
  onMoveTrace,
  onSetYRange,
  overlay,
  svgRef,
  onPointerMove,
  onPointerUp,
}: ScopePaneProps): ReactElement => {
  const leftTraces = traces.filter((t) => unitOf(t.expr) === leftUnit)
  const rightTraces = rightUnit
    ? traces.filter((t) => unitOf(t.expr) === rightUnit)
    : []

  return (
    <div className="scope-pane">
      <div className="pane-head">
        <span className="pane-axis">{UNIT_DISPLAY[leftUnit].label}</span>
        {traces.map((t) => (
          <button
            key={t.key}
            type="button"
            className="pane-trace"
            style={{ color: t.color }}
            onClick={() => onMoveTrace(t.key)}
            title="クリックで次のペインへ移す"
          >
            {t.label} ⇅
          </button>
        ))}
        <span className="pane-spacer" />
        <button
          type="button"
          className="toggle"
          aria-pressed={pane.yMode === 'manual'}
          onClick={() =>
            onSetYRange(
              pane.yMode === 'manual'
                ? null
                : { min: scales.yRange.min, max: scales.yRange.max },
            )
          }
          title="Y 軸を自動レンジ / 手動レンジに切り替える"
        >
          Y {pane.yMode === 'manual' ? '手動' : '自動'}
        </button>
        {pane.yMode === 'manual' && (
          <span className="pane-range">
            <input
              type="number"
              value={scales.yRange.min}
              step="any"
              aria-label="Y 軸の下限"
              onChange={(e) =>
                onSetYRange({ min: Number(e.target.value), max: scales.yRange.max })
              }
            />
            〜
            <input
              type="number"
              value={scales.yRange.max}
              step="any"
              aria-label="Y 軸の上限"
              onChange={(e) =>
                onSetYRange({ min: scales.yRange.min, max: Number(e.target.value) })
              }
            />
          </span>
        )}
        {canRemove && (
          <button
            type="button"
            className="pane-remove"
            onClick={onRemove}
            aria-label="このペインを閉じる"
            title="このペインを閉じる (中のトレースは残りのペインへ戻る)"
          >
            ×
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        className="waveform"
        viewBox={`0 0 600 ${height}`}
        role="img"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <TimePlot
          scales={scales}
          time={time}
          leftTraces={leftTraces}
          rightTraces={rightTraces}
          leftUnit={UNIT_DISPLAY[leftUnit].label}
          rightAxis={rightAxis}
          rightScale={rightScale}
          sweeping={sweeping}
          tHead={tHead}
          reference={reference}
          selectedBlockId={selectedBlockId}
        />
        {overlay}
      </svg>
    </div>
  )
}
