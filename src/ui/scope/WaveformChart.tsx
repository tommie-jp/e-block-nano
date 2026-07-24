import { useMemo, useRef, useState } from 'react'
import type { PointerEvent, ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { measureSeries } from '../../core/simulation/spice/measure'
import type { NodeProbe } from '../waveProbes'
import { dominantOscillation, viewWindow } from '../waveProbes'
import { Cursors } from './Cursors'
import type { CursorId, CursorState } from './Cursors'
import { CHART, DEFAULT_WINDOW, DEFAULT_Y_RANGE, makeScales } from './geometry'
import { Graticule } from './Graticule'
import { laneBand } from './lanes'
import type { MathNodes } from './mathTrace'
import { differenceSeries } from './mathTrace'
import { MeasurementTable } from './MeasurementTable'
import { triggerTime } from './trigger'
import type { Slope } from './trigger'
import { XYPlot } from './XYPlot'
import { FftPlot } from './FftPlot'

// 描画点の上限。過渡は適応ステップで数万点になる (マルチバイブレータ ~5万点)
const MAX_POINTS = 1000
const MATH_COLOR = '#ffffff'
const GAINS = [0.5, 1, 2, 4, 8]

type View = 'time' | 'xy' | 'fft'

interface Trace {
  key: string
  label: string
  color: string
  constant: boolean
  values: number[]
}

interface WaveformChartProps {
  waveforms: Waveforms | null
  probes: NodeProbe[]
  hidden: ReadonlySet<string>
  onToggle: (nodeId: string) => void
  status?: string | null
  /** 計算中の推定進捗 [%] (0-100)。null なら進捗バーを出さない */
  progress?: number | null
  mathNodes?: MathNodes | null
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
const mean = (values: readonly number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

/**
 * オシロ相当の波形ビュー。時間/XY/FFT の表示切替に加え、
 * Tier1 (目盛り/測定/カーソル), Tier2 (段組み/振幅/Math/参照),
 * Tier3 (エッジトリガ/AC カップリング/XY/FFT) を持つ。
 */
export const WaveformChart = ({
  waveforms,
  probes,
  hidden,
  onToggle,
  status,
  progress,
  mathNodes,
  reference,
  onSaveReference,
  onClearReference,
}: WaveformChartProps): ReactElement => {
  const svgRef = useRef<SVGSVGElement>(null)
  const hasData = waveforms != null && probes.length > 0

  const [view, setView] = useState<View>('time')
  const [mode, setMode] = useState<'overlay' | 'stacked'>('overlay')
  const [gain, setGain] = useState(1)
  const [ac, setAc] = useState(false)
  const [trigOn, setTrigOn] = useState(false)
  const [trigSlope, setTrigSlope] = useState<Slope>('rising')
  const [cursorsOn, setCursorsOn] = useState(false)
  const [cursor, setCursor] = useState<CursorState>({ tA: 0, tB: 0, vA: 0, vB: 0 })
  const [dragging, setDragging] = useState<CursorId | null>(null)
  const [xySel, setXySel] = useState<{ x: string; y: string }>({ x: '', y: '' })
  const [fftSel, setFftSel] = useState('')

  const visible = useMemo(
    () => probes.filter((p) => !hidden.has(p.nodeId)),
    [probes, hidden],
  )
  const visibleIds = visible.map((p) => p.nodeId)
  // 既定ソースは発振ノード (非 constant) を優先。レール(N1)を選ばないように
  const preferredIds = [
    ...visible.filter((p) => !p.constant).map((p) => p.nodeId),
    ...visible.filter((p) => p.constant).map((p) => p.nodeId),
  ]
  const xX = xySel.x && visibleIds.includes(xySel.x) ? xySel.x : preferredIds[0] ?? ''
  const xY =
    xySel.y && visibleIds.includes(xySel.y)
      ? xySel.y
      : preferredIds[1] ?? preferredIds[0] ?? ''
  const fftId = fftSel && visibleIds.includes(fftSel) ? fftSel : preferredIds[0] ?? ''

  // トリガ: 支配ノードの中点を最初に横切る時刻へ窓の左端を合わせる
  const win = useMemo(() => {
    if (!hasData) return DEFAULT_WINDOW
    const base = viewWindow(waveforms, probes)
    if (!trigOn) return base
    const src = dominantOscillation(waveforms, probes)
    const nodeId = src?.nodeId ?? visibleIds[0]
    if (!nodeId) return base
    const vals = waveforms.nodeVoltages[nodeId]
    const { lo, hi } = range(vals)
    const t = triggerTime(waveforms.time, vals, (lo + hi) / 2, trigSlope)
    if (t == null) return base
    const span = base.end - base.start
    const end = Math.min(waveforms.time.at(-1) ?? t + span, t + span)
    return { start: t, end }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, waveforms, probes, trigOn, trigSlope])

  // AC カップリング: 各系列から DC (平均) を引いて描く
  const dc = useMemo(() => {
    const m = new Map<string, number>()
    if (waveforms) for (const p of probes) m.set(p.nodeId, mean(waveforms.nodeVoltages[p.nodeId]))
    return m
  }, [waveforms, probes])

  const yRange = useMemo(() => {
    if (!hasData) return DEFAULT_Y_RANGE
    let min = 0
    let max = 0
    for (const p of probes) {
      const d = ac ? (dc.get(p.nodeId) ?? 0) : 0
      for (const v of waveforms.nodeVoltages[p.nodeId]) {
        const x = v - d
        if (x < min) min = x
        if (x > max) max = x
      }
    }
    return min === max ? { min: -1, max: 1 } : { min, max }
  }, [hasData, waveforms, probes, ac, dc])

  const scales = useMemo(() => makeScales(win, yRange), [win, yRange])

  const mathValues = useMemo(() => {
    if (!waveforms || !mathNodes) return null
    const a = waveforms.nodeVoltages[mathNodes.a]
    const b = waveforms.nodeVoltages[mathNodes.b]
    return a && b ? differenceSeries(a, b) : null
  }, [waveforms, mathNodes])

  // 描画トレース (可視プローブ + Math)。AC 時は DC を除去
  const traces = useMemo<Trace[]>(() => {
    if (!waveforms) return []
    const detrend = (id: string, raw: number[]): number[] =>
      ac ? raw.map((v) => v - (dc.get(id) ?? mean(raw))) : raw
    const list: Trace[] = visible.map((p) => ({
      key: p.nodeId,
      label: p.label,
      color: p.color,
      constant: p.constant,
      values: detrend(p.nodeId, waveforms.nodeVoltages[p.nodeId]),
    }))
    if (mathValues && mathNodes) {
      list.push({
        key: '__math',
        label: mathNodes.label,
        color: MATH_COLOR,
        constant: false,
        values: ac ? mathValues.map((v) => v - mean(mathValues)) : mathValues,
      })
    }
    return list
  }, [waveforms, visible, mathValues, mathNodes, ac, dc])

  // --- カーソル (時間ビュー・重ね表示時のみ) ---
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
  const stackedY = (lane: { cy: number; half: number }, values: readonly number[]) => {
    const { lo, hi } = range(values)
    const mid = (lo + hi) / 2
    const amp = Math.max(1e-9, (hi - lo) / 2)
    return (v: number): number => lane.cy - ((v - mid) / amp) * lane.half * gain
  }

  const stacked = view === 'time' && mode === 'stacked'
  const cursorsUsable = hasData && view === 'time' && !stacked
  const time = waveforms?.time ?? []
  const dt = Math.abs(cursor.tB - cursor.tA)
  const dv = Math.abs(cursor.vB - cursor.vA)
  const plotCx = (scales.plot.left + scales.plot.right) / 2
  const plotCy = (scales.plot.top + scales.plot.bottom) / 2
  // オーバーレイの色分け: 警告/失敗系は赤、準備中/計算中などは情報色
  const statusIsError =
    !!status &&
    (status.startsWith('⚠') ||
      status.includes('失敗') ||
      status.includes('できません') ||
      status.includes('エラー'))
  const hasProgress = !!status && !statusIsError && progress != null
  const mathMeasure =
    mathValues && waveforms ? measureSeries(waveforms.time, mathValues) : null
  const labelOf = (id: string): string =>
    probes.find((p) => p.nodeId === id)?.label ?? id
  const colorOf = (id: string): string =>
    probes.find((p) => p.nodeId === id)?.color ?? '#4fc3f7'

  const viewBtn = (v: View, text: string): ReactElement => (
    <button
      type="button"
      className="toggle"
      aria-pressed={view === v}
      disabled={!hasData}
      onClick={() => setView(v)}
    >
      {text}
    </button>
  )

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
        {view === 'time' && <Graticule scales={scales} showY={!stacked} />}

        {view === 'time' &&
          !stacked &&
          hasData &&
          reference &&
          traces.map((t) => {
            const ref = reference.nodeVoltages[t.key]
            return ref ? (
              <polyline
                key={`ref-${t.key}`}
                className="wave-line reference"
                stroke={t.color}
                points={pointsFor(reference.time, ref, scales.y)}
              />
            ) : null
          })}

        {view === 'time' &&
          hasData &&
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

        {view === 'xy' && hasData && xX && xY && (
          <XYPlot
            waveforms={waveforms}
            xId={xX}
            yId={xY}
            xLabel={labelOf(xX)}
            yLabel={labelOf(xY)}
          />
        )}
        {view === 'fft' && hasData && fftId && (
          <FftPlot
            waveforms={waveforms}
            nodeId={fftId}
            color={colorOf(fftId)}
            label={labelOf(fftId)}
          />
        )}

        {cursorsOn && cursorsUsable && (
          <Cursors scales={scales} cursor={cursor} onGrab={grab} />
        )}
        {status && (
          <g>
            <rect
              x={scales.plot.left}
              y={plotCy - 26}
              width={scales.plot.width}
              height={hasProgress ? 66 : 52}
              rx={10}
              className={`wave-overlay-bg${statusIsError ? ' error' : ''}`}
            />
            <text
              x={plotCx}
              y={hasProgress ? plotCy - 8 : plotCy}
              textAnchor="middle"
              className={`wave-overlay${statusIsError ? ' error' : ''}`}
            >
              {status}
            </text>
            {hasProgress && (
              <>
                <rect
                  x={plotCx - 110}
                  y={plotCy + 14}
                  width={220}
                  height={8}
                  rx={4}
                  className="wave-progress-track"
                />
                <rect
                  x={plotCx - 110}
                  y={plotCy + 14}
                  width={(220 * (progress ?? 0)) / 100}
                  height={8}
                  rx={4}
                  className="wave-progress-fill"
                />
              </>
            )}
          </g>
        )}
      </svg>

      {/* 表示モード */}
      <div className="wave-controls">
        {viewBtn('time', '時間')}
        {viewBtn('xy', 'XY')}
        {viewBtn('fft', 'FFT')}
        {view === 'xy' && hasData && (
          <span className="src-picker">
            X
            <select value={xX} onChange={(e) => setXySel((s) => ({ ...s, x: e.target.value }))}>
              {visible.map((p) => (
                <option key={p.nodeId} value={p.nodeId}>
                  {p.label}
                </option>
              ))}
            </select>
            Y
            <select value={xY} onChange={(e) => setXySel((s) => ({ ...s, y: e.target.value }))}>
              {visible.map((p) => (
                <option key={p.nodeId} value={p.nodeId}>
                  {p.label}
                </option>
              ))}
            </select>
          </span>
        )}
        {view === 'fft' && hasData && (
          <span className="src-picker">
            対象
            <select value={fftId} onChange={(e) => setFftSel(e.target.value)}>
              {visible.map((p) => (
                <option key={p.nodeId} value={p.nodeId}>
                  {p.label}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>

      {/* 時間ビューの操作 */}
      {view === 'time' && (
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
            aria-pressed={ac}
            disabled={!hasData}
            onClick={() => setAc((v) => !v)}
          >
            AC
          </button>
          <button
            type="button"
            className="toggle"
            aria-pressed={trigOn}
            disabled={!hasData}
            onClick={() => setTrigOn((v) => !v)}
          >
            トリガ
          </button>
          {trigOn && (
            <button
              type="button"
              onClick={() => setTrigSlope((s) => (s === 'rising' ? 'falling' : 'rising'))}
              aria-label="トリガのスロープ"
            >
              {trigSlope === 'rising' ? '↑' : '↓'}
            </button>
          )}
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
            <button
              type="button"
              disabled={!hasData || !onSaveReference}
              onClick={onSaveReference}
            >
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
      )}

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

      {hasData && view === 'time' && (
        <MeasurementTable waveforms={waveforms} probes={probes} hidden={hidden} />
      )}
    </div>
  )
}
