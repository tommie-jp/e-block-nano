import type { ReactElement } from 'react'
import { unitOf } from '../../core/scope/traceExpr'
import type { TraceExpr } from '../../core/scope/traceExpr'
import type { NodeProbe } from '../waveProbes'
import { fmtI, fmtW } from './format'
import type { DrawTrace } from './traceSeries'

interface ScopeLegendProps {
  probes: readonly NodeProbe[]
  hidden: ReadonlySet<string>
  onToggle: (nodeId: string) => void
  /** 電流・電力のトレース (ノード電圧は probes 側) */
  currentTraces: readonly DrawTrace[]
  /** 凡例クリックでそのプローブを外す (渡さなければ表示のみ) */
  onRemoveTrace?: (expr: TraceExpr) => void
  /** ボードで選択中の素子。電流の凡例を強調する */
  selectedBlockId?: string | null
}

/** 凡例。ノード電圧は表示トグル、素子電流はプローブの取り外し */
export const ScopeLegend = ({
  probes,
  hidden,
  onToggle,
  currentTraces,
  onRemoveTrace,
  selectedBlockId,
}: ScopeLegendProps): ReactElement => (
  <ul className="wave-legend">
    {probes.map((p) => {
      const off = hidden.has(p.nodeId)
      return (
        <li key={p.nodeId}>
          <button
            type="button"
            className={`wave-legend-item${off ? ' off' : ''}${p.constant ? ' constant' : ''}`}
            aria-pressed={!off}
            onClick={() => onToggle(p.nodeId)}
            title={off ? 'クリックで表示' : 'クリックで非表示'}
          >
            <span className="wave-swatch" style={{ background: p.color }} />
            {p.label}
            {p.constant ? ' (一定)' : ''}
          </button>
        </li>
      )
    })}
    {currentTraces.map((t) => {
      const id = t.expr.kind === 'i' || t.expr.kind === 'p' ? t.expr.block : ''
      const last = t.values.length > 0 ? t.values[t.values.length - 1] : 0
      const unit = unitOf(t.expr)
      const fmt =
        unit === 'W' ? fmtW : unit === 'A' ? fmtI : (v: number) => v.toPrecision(3)
      const sel = id === selectedBlockId
      return (
        <li key={t.key}>
          <button
            type="button"
            className="wave-legend-item"
            onClick={() => onRemoveTrace?.(t.expr)}
            title={onRemoveTrace ? 'クリックでこのプローブを外す' : undefined}
            style={{
              opacity: selectedBlockId && !sel ? 0.5 : 1,
              fontWeight: sel ? 700 : 400,
              cursor: onRemoveTrace ? 'pointer' : 'default',
            }}
          >
            <span
              className="wave-swatch"
              style={{
                background: `repeating-linear-gradient(90deg, ${t.color} 0 4px, transparent 4px 7px)`,
              }}
            />
            {t.label} {fmt(last)}
            {/* 電力の符号は ngspice の電流の向きどおり。負 = その素子が出している */}
            {unitOf(t.expr) === 'W' && last < 0 ? ' (供給)' : ''}
            {sel ? ' ◀ 選択' : ''}
          </button>
        </li>
      )
    })}
  </ul>
)
