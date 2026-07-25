import type { ReactElement } from 'react'
import type { NodeProbe } from '../waveProbes'
import { fmtI } from './format'
import type { DrawTrace } from './traceSeries'

interface ScopeLegendProps {
  probes: readonly NodeProbe[]
  hidden: ReadonlySet<string>
  onToggle: (nodeId: string) => void
  currentTraces: readonly DrawTrace[]
  /** 電流の凡例クリックでプローブを外す (渡さなければ表示のみ) */
  onToggleCurrent?: (blockId: string) => void
  /** ボードで選択中の素子。電流の凡例を強調する */
  selectedBlockId?: string | null
}

/** 凡例。ノード電圧は表示トグル、素子電流はプローブの取り外し */
export const ScopeLegend = ({
  probes,
  hidden,
  onToggle,
  currentTraces,
  onToggleCurrent,
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
      const id = t.key.slice(2) // 'i:blockId' → blockId
      const last = t.values.length > 0 ? t.values[t.values.length - 1] : 0
      const sel = id === selectedBlockId
      return (
        <li key={t.key}>
          <button
            type="button"
            className="wave-legend-item"
            onClick={() => onToggleCurrent?.(id)}
            title={onToggleCurrent ? 'クリックで電流プローブを外す' : undefined}
            style={{
              opacity: selectedBlockId && !sel ? 0.5 : 1,
              fontWeight: sel ? 700 : 400,
              cursor: onToggleCurrent ? 'pointer' : 'default',
            }}
          >
            <span
              className="wave-swatch"
              style={{
                background: `repeating-linear-gradient(90deg, ${t.color} 0 4px, transparent 4px 7px)`,
              }}
            />
            {t.label} {fmtI(last)}
            {sel ? ' ◀ 選択' : ''}
          </button>
        </li>
      )
    })}
  </ul>
)
