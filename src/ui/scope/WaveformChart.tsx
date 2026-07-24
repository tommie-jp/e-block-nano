import { useMemo, useRef, useState } from 'react'
import type { PointerEvent, ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { measureSeries } from '../../core/simulation/spice/measure'
import type { NodeProbe } from '../waveProbes'
import { viewWindow } from '../waveProbes'
import { Cursors } from './Cursors'
import type { CursorId, CursorState } from './Cursors'
import {
  CHART,
  DEFAULT_WINDOW,
  DEFAULT_Y_RANGE,
  makeScales,
  voltageRange,
} from './geometry'
import { Graticule } from './Graticule'
import { laneBand } from './lanes'
import type { MathNodes } from './mathTrace'
import { differenceSeries } from './mathTrace'
import { MeasurementTable } from './MeasurementTable'

// 描画点の上限。過渡は適応ステップで数万点になる (マルチバイブレータ ~5万点)
const MAX_POINTS = 1000
// Math (差動) トレースの色。系列色 (SERIES_COLORS) と衝突しない白
const MATH_COLOR = '#ffffff'
// 振幅ズーム (段組み時の V/div 相当) の選択肢
const GAINS = [0.5, 1, 2, 4, 8]

interface Trace {
  key: string
  label: string
  color: string
  constant: boolean
  values: number[]
}

interface WaveformChartProps {
  /** null なら空のオシロ (グレーティクルのみ) を描く */
  waveforms: Waveforms | null
  probes: NodeProbe[]
  hidden: ReadonlySet<string>
  onToggle: (nodeId: string) => void
  status?: string | null
  /** 選択中 2 端子素子の両端ノード。差動トレースを描く */
  mathNodes?: MathNodes | null
  /** 比較用に保存した波形 (薄く重ねる) */
  reference?: Waveforms | null
  onSaveReference?: () => void
  onClearReference?: () => void
}

const fmtT = (t: number): string =>
  Math.abs(t) >= 1 ? `${t.toFixed(2)} s` : `${(t * 1000).toFixed(0)} ms`
const fmtHz = (f: number): string =>
  f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(2)} Hz`
const fmtV = (v: number): string =>
  Math.abs(v) >= 1 ? `${v.toFixed(2)} V` : `${(v * 1000).toFixed(0)} mV`

const range = (values: readonly number[]): { lo: number; hi: number } => {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return Number.isFinite(lo) ? { lo, hi } : { lo: 0, hi: 0 }
}

/**
 * オシロ相当の波形ビュー。Tier1 (目盛り/測定/カーソル) に加え、
 * - 段組み表示 (重なり解消) と振幅ズーム (V/div 相当)
 * - Math A−B (選択 2 端子素子の両端電圧)
 * - リファレンス波形 (編集前を薄く重ねて比較)
 * を持つ。ngspice 未準備でも空オシロを常時描く (waveforms=null)。
 */
export const WaveformChart = ({
  waveforms,
  probes,
  hidden,
  onToggle,
  status,
  mathNodes,
  reference,
  onSaveReference,
  onClearReference,
}: WaveformChartProps): ReactElement => {
  const svgRef = useRef<SVGSVGElement>(null)
  const hasData = waveforms != null && probes.length > 0

  const [mode, setMode] = useState<'overlay' | 'stacked'>('overlay')
  const [gain, setGain] = useState(1)
  const [cursorsOn, setCursorsOn] = useState(false)
  const [cursor, setCursor] = useState<CursorState>({ tA: 0, tB: 0, vA: 0, vB: 0 })
  const [dragging, setDragging] = useState<CursorId | null>(null)

  const win = useMemo(
    () => (hasData ? viewWindow(waveforms, probes) : DEFAULT_WINDOW),
    [hasData, waveforms, probes],
  )
  const yRange = useMemo(
    () => (hasData ? voltageRange(waveforms, probes) : DEFAULT_Y_RANGE),
    [hasData, waveforms, probes],
  )
  const scales = useMemo(() => makeScales(win, yRange), [win, yRange])

  // Math (差動) 系列: 両端ノードが揃っていれば A−B を作る
  const mathValues = useMemo(() => {
    if (!waveforms || !mathNodes) return null
    const a = waveforms.nodeVoltages[mathNodes.a]
    const b = waveforms.nodeVoltages[mathNodes.b]
    return a && b ? differenceSeries(a, b) : null
  }, [waveforms, mathNodes])

  // 描画するトレース (可視プローブ + Math)。段組み/重ねで共通に使う
  const traces = useMemo<Trace[]>(() => {
    if (!waveforms) return []
    const list: Trace[] = probes
      .filter((p) => !hidden.has(p.nodeId))
      .map((p) => ({
        key: p.nodeId,
        label: p.label,
        color: p.color,
        constant: p.constant,
        values: waveforms.nodeVoltages[p.nodeId],
      }))
    if (mathValues && mathNodes) {
      list.push({
        key: '__math',
        label: mathNodes.label,
        color: MATH_COLOR,
        constant: false,
        values: mathValues,
      })
    }
    return list
  }, [waveforms, probes, hidden, mathValues, mathNodes])

  // --- カーソル (既定オフ、重ね表示時のみ) ---
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

  // 時系列を折れ線 points 文字列に。yFn で重ね/段組みを切り替える
  const pointsFor = (
    t: readonly number[],
    values: readonly number[],
    yFn: (v: number) => number,
  ): string => {
    let k = 0
    while (k < t.length && t[k] < win.start) k++
    const stride = Math.max(1, Math.ceil((t.length - k) / MAX_POINTS))
    const parts: string[] = []
    for (let j = k; j < values.length; j += stride) {
      parts.push(`${scales.x(t[j])},${yFn(values[j])}`)
    }
    return parts.join(' ')
  }
  // 段組み: 各トレースを自分のレーンに自動フィット (中点基準) + gain 倍
  const stackedY = (lane: { cy: number; half: number }, values: readonly number[]) => {
    const { lo, hi } = range(values)
    const mid = (lo + hi) / 2
    const amp = Math.max(1e-9, (hi - lo) / 2)
    return (v: number): number => lane.cy - ((v - mid) / amp) * lane.half * gain
  }

  const stacked = mode === 'stacked'
  const cursorsUsable = hasData && !stacked
  const time = waveforms?.time ?? []
  const dt = Math.abs(cursor.tB - cursor.tA)
  const dv = Math.abs(cursor.vB - cursor.vA)
  const plotCx = (scales.plot.left + scales.plot.right) / 2
  const plotCy = (scales.plot.top + scales.plot.bottom) / 2
  const mathMeasure =
    mathValues && waveforms ? measureSeries(waveforms.time, mathValues) : null

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
        <Graticule scales={scales} showY={!stacked} />

        {/* リファレンス波形 (重ね表示時のみ、薄い破線) */}
        {!stacked &&
          hasData &&
          reference &&
          traces.map((t) => {
            const ref = reference.nodeVoltages[t.key]
            if (!ref) return null
            return (
              <polyline
                key={`ref-${t.key}`}
                className="wave-line reference"
                stroke={t.color}
                points={pointsFor(reference.time, ref, scales.y)}
              />
            )
          })}

        {/* 波形本体 */}
        {hasData &&
          traces.map((t, i) => {
            if (stacked) {
              const lane = laneBand(i, traces.length, scales.plot)
              return (
                <g key={t.key}>
                  <line
                    x1={scales.plot.left}
                    y1={lane.cy}
                    x2={scales.plot.right}
                    y2={lane.cy}
                    className="lane-baseline"
                  />
                  <text
                    x={scales.plot.left + 2}
                    y={lane.cy - lane.half + 9}
                    className="lane-label"
                    fill={t.color}
                  >
                    {t.label}
                  </text>
                  <polyline
                    className="wave-line"
                    stroke={t.color}
                    points={pointsFor(time, t.values, stackedY(lane, t.values))}
                  />
                </g>
              )
            }
            const cls =
              t.key === '__math'
                ? 'wave-line math'
                : t.constant
                  ? 'wave-line constant'
                  : 'wave-line'
            return (
              <polyline
                key={t.key}
                className={cls}
                stroke={t.color}
                points={pointsFor(time, t.values, scales.y)}
              />
            )
          })}

        {cursorsOn && cursorsUsable && (
          <Cursors scales={scales} cursor={cursor} onGrab={grab} />
        )}
        {status && (
          <text x={plotCx} y={plotCy} className="wave-overlay" textAnchor="middle">
            {status}
          </text>
        )}
      </svg>

      <div className="wave-controls">
        <button
          type="button"
          className="toggle"
          aria-pressed={stacked}
          disabled={!hasData}
          onClick={() => setMode(stacked ? 'overlay' : 'stacked')}
        >
          段組み
        </button>
        <span className="gain-control">
          振幅
          <button
            type="button"
            disabled={!hasData || gain <= GAINS[0]}
            onClick={() => setGain((g) => GAINS[Math.max(0, GAINS.indexOf(g) - 1)])}
            aria-label="振幅を下げる"
          >
            −
          </button>
          ×{gain}
          <button
            type="button"
            disabled={!hasData || gain >= GAINS.at(-1)!}
            onClick={() =>
              setGain((g) => GAINS[Math.min(GAINS.length - 1, GAINS.indexOf(g) + 1)])
            }
            aria-label="振幅を上げる"
          >
            +
          </button>
        </span>
        <button
          type="button"
          className="toggle"
          aria-pressed={cursorsOn}
          disabled={!cursorsUsable}
          onClick={() => (cursorsOn ? setCursorsOn(false) : enableCursors())}
        >
          カーソル
        </button>
        {reference ? (
          <button type="button" disabled={!onClearReference} onClick={onClearReference}>
            参照クリア
          </button>
        ) : (
          <button type="button" disabled={!hasData || !onSaveReference} onClick={onSaveReference}>
            参照を保存
          </button>
        )}
        {cursorsOn && cursorsUsable && (
          <span className="cursor-readout">
            Δt = {fmtT(dt)}
            {dt > 0 && <> / 1/Δt = {fmtHz(1 / dt)}</>} &nbsp; ΔV = {fmtV(dv)}
          </span>
        )}
        {mathMeasure && (
          <span className="math-readout">
            M (両端): Vpp {fmtV(mathMeasure.vpp)} / Vavg {fmtV(mathMeasure.vavg)}
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

      {hasData && (
        <MeasurementTable waveforms={waveforms} probes={probes} hidden={hidden} />
      )}
    </div>
  )
}
