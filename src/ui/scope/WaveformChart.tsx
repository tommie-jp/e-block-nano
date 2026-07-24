import { useMemo, useRef, useState } from 'react'
import type { PointerEvent, ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { NodeProbe } from '../waveProbes'
import { viewWindow } from '../waveProbes'
import { Cursors } from './Cursors'
import type { CursorId, CursorState } from './Cursors'
import { CHART, makeScales, voltageRange } from './geometry'
import { Graticule } from './Graticule'
import { MeasurementTable } from './MeasurementTable'

// 描画点の上限。過渡は適応ステップで数万点になる (マルチバイブレータ ~5万点)
const MAX_POINTS = 1000

interface WaveformChartProps {
  waveforms: Waveforms
  probes: NodeProbe[]
  hidden: ReadonlySet<string>
  onToggle: (nodeId: string) => void
}

const fmtT = (t: number): string =>
  Math.abs(t) >= 1 ? `${t.toFixed(2)} s` : `${(t * 1000).toFixed(0)} ms`
const fmtHz = (f: number): string =>
  f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(2)} Hz`
const fmtV = (v: number): string =>
  Math.abs(v) >= 1 ? `${v.toFixed(2)} V` : `${(v * 1000).toFixed(0)} mV`

/**
 * オシロ相当の波形ビュー: グレーティクル (X/Y 目盛り) + 波形線 + カーソル +
 * 自動測定表 + 凡例。純ロジック (viewWindow/measureSeries/niceTicks) を組み合わせる。
 */
export const WaveformChart = ({
  waveforms,
  probes,
  hidden,
  onToggle,
}: WaveformChartProps): ReactElement => {
  const { time, nodeVoltages } = waveforms
  const svgRef = useRef<SVGSVGElement>(null)

  const visible = useMemo(
    () => probes.filter((p) => !hidden.has(p.nodeId)),
    [probes, hidden],
  )
  const win = useMemo(() => viewWindow(waveforms, probes), [waveforms, probes])
  // y レンジは全プローブ (非表示含む) で固定し、トグルで縦スケールが動かないように
  const yRange = useMemo(() => voltageRange(waveforms, probes), [waveforms, probes])
  const scales = useMemo(() => makeScales(win, yRange), [win, yRange])

  // --- カーソル (既定オフ) ---
  const [cursorsOn, setCursorsOn] = useState(false)
  const [cursor, setCursor] = useState<CursorState>({ tA: 0, tB: 0, vA: 0, vB: 0 })
  const [dragging, setDragging] = useState<CursorId | null>(null)

  const enableCursors = (): void => {
    const span = win.end - win.start
    const vSpan = yRange.max - yRange.min
    setCursor({
      tA: win.start + span * 0.33,
      tB: win.start + span * 0.66,
      vA: yRange.min + vSpan * 0.33,
      vB: yRange.min + vSpan * 0.66,
    })
    setCursorsOn(true)
  }

  const toSvg = (e: PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CHART.W,
      y: ((e.clientY - rect.top) / rect.height) * CHART.H,
    }
  }

  const grab = (id: CursorId, e: PointerEvent): void => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    setDragging(id)
  }
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return
    const { x, y } = toSvg(e)
    setCursor((c) =>
      dragging === 'tA'
        ? { ...c, tA: scales.tFromX(x) }
        : dragging === 'tB'
          ? { ...c, tB: scales.tFromX(x) }
          : dragging === 'vA'
            ? { ...c, vA: scales.vFromY(y) }
            : { ...c, vB: scales.vFromY(y) },
    )
  }
  const endDrag = (): void => setDragging(null)

  // 表示窓内の添字範囲 (time は昇順)
  let i0 = 0
  while (i0 < time.length && time[i0] < win.start) i0++
  const stride = Math.max(1, Math.ceil((time.length - i0) / MAX_POINTS))
  const pointsFor = (values: number[]): string => {
    const parts: string[] = []
    for (let j = i0; j < values.length; j += stride) {
      parts.push(`${scales.x(time[j])},${scales.y(values[j])}`)
    }
    return parts.join(' ')
  }

  const dt = Math.abs(cursor.tB - cursor.tA)
  const dv = Math.abs(cursor.vB - cursor.vA)

  return (
    <div className="wave-wrap">
      <svg
        ref={svgRef}
        className="waveform"
        viewBox={`0 0 ${CHART.W} ${CHART.H}`}
        role="img"
        onPointerMove={onMove}
        onPointerUp={endDrag}
      >
        <Graticule scales={scales} />
        {visible.map((p) => (
          <polyline
            key={p.nodeId}
            className={p.constant ? 'wave-line constant' : 'wave-line'}
            stroke={p.color}
            points={pointsFor(nodeVoltages[p.nodeId])}
          />
        ))}
        {cursorsOn && <Cursors scales={scales} cursor={cursor} onGrab={grab} />}
      </svg>

      <div className="wave-controls">
        <button
          type="button"
          className="toggle"
          aria-pressed={cursorsOn}
          onClick={() => (cursorsOn ? setCursorsOn(false) : enableCursors())}
        >
          カーソル
        </button>
        {cursorsOn && (
          <span className="cursor-readout">
            Δt = {fmtT(dt)}
            {dt > 0 && <> / 1/Δt = {fmtHz(1 / dt)}</>} &nbsp; ΔV = {fmtV(dv)}
          </span>
        )}
      </div>

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
      </ul>

      <MeasurementTable waveforms={waveforms} probes={visible} />
    </div>
  )
}
