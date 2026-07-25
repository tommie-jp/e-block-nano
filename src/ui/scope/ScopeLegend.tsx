import type { MouseEvent, ReactElement } from 'react'
import { unitOf } from '../../core/scope/traceExpr'
import type { TraceExpr } from '../../core/scope/traceExpr'
import type { NodeProbe } from '../waveProbes'
import { formatValue } from './format'
import type { DrawTrace } from './traceSeries'

interface ScopeLegendProps {
  probes: readonly NodeProbe[]
  hidden: ReadonlySet<string>
  onToggle: (nodeId: string) => void
  /** ノード電圧以外のトレース (電流・電力・式) */
  currentTraces: readonly DrawTrace[]
  /** 凡例クリックでそのトレースを外す (渡さなければ表示のみ) */
  onRemoveTrace?: (expr: TraceExpr) => void
  /** Shift+クリック: カーソルをこのトレースに吸着させる (LTspice の Attach Cursor) */
  onSelectCursorTrace?: (traceKey: string) => void
  /** Ctrl+クリック: 平均・RMS を出す (LTspice の Ctrl+左クリック) */
  onSelectStatsTrace?: (traceKey: string) => void
  cursorTraceKey?: string | null
  statsKey?: string | null
  /** ボードで選択中の素子。電流の凡例を強調する */
  selectedBlockId?: string | null
}

/** 修飾キーで意味が変わる凡例クリック (LTspice と同じ割り当て) */
const clickKind = (e: MouseEvent): 'cursor' | 'stats' | 'plain' =>
  e.shiftKey ? 'cursor' : e.ctrlKey || e.metaKey ? 'stats' : 'plain'

const TITLE = 'クリック=表示切替 / Shift+クリック=カーソル吸着 / Ctrl+クリック=平均・RMS'
const TITLE_TRACE =
  'クリック=このトレースを外す / Shift+クリック=カーソル吸着 / Ctrl+クリック=平均・RMS'

/** 吸着中 (⌖) と 平均・RMS 表示中 (Σ) の印 */
const marks = (
  key: string,
  cursorKey?: string | null,
  statsKey?: string | null,
): string => `${cursorKey === key ? ' ⌖' : ''}${statsKey === key ? ' Σ' : ''}`

/** 凡例。ノード電圧は表示トグル、その他のトレースは取り外し */
export const ScopeLegend = ({
  probes,
  hidden,
  onToggle,
  currentTraces,
  onRemoveTrace,
  onSelectCursorTrace,
  onSelectStatsTrace,
  cursorTraceKey,
  statsKey,
  selectedBlockId,
}: ScopeLegendProps): ReactElement => (
  <ul className="wave-legend">
    {probes.map((p) => {
      const off = hidden.has(p.nodeId)
      const key = `v:${p.nodeId}`
      return (
        <li key={p.nodeId}>
          <button
            type="button"
            className={`wave-legend-item${off ? ' off' : ''}${p.constant ? ' constant' : ''}`}
            aria-pressed={!off}
            onClick={(e) => {
              const kind = clickKind(e)
              if (kind === 'cursor') onSelectCursorTrace?.(key)
              else if (kind === 'stats') onSelectStatsTrace?.(key)
              else onToggle(p.nodeId)
            }}
            title={TITLE}
          >
            <span className="wave-swatch" style={{ background: p.color }} />
            {p.label}
            {p.constant ? ' (一定)' : ''}
            {marks(key, cursorTraceKey, statsKey)}
          </button>
        </li>
      )
    })}
    {currentTraces.map((t) => {
      const id = t.expr.kind === 'i' || t.expr.kind === 'p' ? t.expr.block : ''
      const last = t.values.length > 0 ? t.values[t.values.length - 1] : 0
      const unit = unitOf(t.expr)
      const sel = id !== '' && id === selectedBlockId
      return (
        <li key={t.key}>
          <button
            type="button"
            className="wave-legend-item"
            onClick={(e) => {
              const kind = clickKind(e)
              if (kind === 'cursor') onSelectCursorTrace?.(t.key)
              else if (kind === 'stats') onSelectStatsTrace?.(t.key)
              else onRemoveTrace?.(t.expr)
            }}
            title={TITLE_TRACE}
            style={{
              opacity: selectedBlockId && !sel ? 0.5 : 1,
              fontWeight: sel ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            <span
              className="wave-swatch"
              style={{
                background: `repeating-linear-gradient(90deg, ${t.color} 0 4px, transparent 4px 7px)`,
              }}
            />
            {t.label} {formatValue(last, unit)}
            {/* 電力の符号は ngspice の電流の向きどおり。負 = その素子が出している */}
            {unit === 'W' && last < 0 ? ' (供給)' : ''}
            {sel ? ' ◀ 選択' : ''}
            {marks(t.key, cursorTraceKey, statsKey)}
          </button>
        </li>
      )
    })}
  </ul>
)
