import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../core/netlist/build'
import type { SimulationPort } from '../core/simulation/port'
import type { Waveforms } from '../core/simulation/spice/mapResult'

interface WaveformPanelProps {
  netlist: Netlist
  hasError: boolean
  simulator: SimulationPort
}

const W = 600
const H = 200
const PAD = 4
// PoC 既定の過渡設定 (RC の τ=1s が収まる範囲)。将来サンプルごとに指定可
const TRAN_STEP = 0.02
const TRAN_STOP = 5

const SERIES_COLORS = ['#4fc3f7', '#ff8a65', '#81c784', '#ba68c8', '#fff176']

/** 波形を単純な折れ線 SVG にする */
const Chart = ({ waveforms }: { waveforms: Waveforms }): ReactElement => {
  const { time, nodeVoltages } = waveforms
  const maxT = time.at(-1) || 1
  const series = Object.entries(nodeVoltages).filter(([, v]) => v.some((x) => x !== 0))
  const maxV = Math.max(
    1,
    ...series.flatMap(([, v]) => v.map((x) => Math.abs(x))),
  )
  const x = (t: number): number => PAD + (t / maxT) * (W - 2 * PAD)
  const y = (v: number): number => H - PAD - (v / maxV) * (H - 2 * PAD)

  return (
    <svg className="waveform" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="wave-axis" />
      {series.map(([nodeId, values], i) => (
        <polyline
          key={nodeId}
          className="wave-line"
          stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
          points={values.map((v, j) => `${x(time[j])},${y(v)}`).join(' ')}
        />
      ))}
      <text x={PAD + 2} y={12} className="wave-label">
        {maxV.toFixed(1)}V
      </text>
      <text x={W - PAD - 2} y={H - PAD - 3} className="wave-label" textAnchor="end">
        {maxT.toFixed(1)}s
      </text>
    </svg>
  )
}

/**
 * 過渡解析(.tran)を on-demand 実行し、ノード電圧の時系列を折れ線表示する。
 * ngspice を裏に持つ (CircuitJS のライブビューとは別の、定量の波形ビュー)。
 */
export const WaveformPanel = ({
  netlist,
  hasError,
  simulator,
}: WaveformPanelProps): ReactElement => {
  const [open, setOpen] = useState(false)
  const [waveforms, setWaveforms] = useState<Waveforms | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analysis = useMemo(
    () => ({ kind: 'tran' as const, step: TRAN_STEP, stop: TRAN_STOP }),
    [],
  )

  useEffect(() => {
    if (!open || hasError) return
    let cancelled = false
    setBusy(true)
    setError(null)
    simulator
      .simulate(netlist, analysis)
      .then((r) => {
        if (cancelled) return
        if (r.status === 'ok' && r.waveforms) setWaveforms(r.waveforms)
        else setError(r.summary)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, hasError, netlist, analysis, simulator])

  return (
    <section className="sim-panel">
      <div className="sim-head">
        <button type="button" onClick={() => setOpen((o) => !o)}>
          {open ? '波形を隠す' : '波形 (過渡解析)'}
        </button>
        <span className="sim-note">ngspice .tran でノード電圧の時間変化</span>
      </div>
      {open &&
        (hasError ? (
          <p className="error">⚠ 回路を修正してから実行してください</p>
        ) : busy ? (
          <p className="status">計算中…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : waveforms ? (
          <Chart waveforms={waveforms} />
        ) : null)}
    </section>
  )
}
