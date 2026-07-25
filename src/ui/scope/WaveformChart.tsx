import { useMemo, useRef, useState } from 'react'
import type { PointerEvent, ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { measureSeries } from '../../core/simulation/spice/measure'
import type { NodeProbe } from '../waveProbes'
import { dominantOscillation, viewWindow } from '../waveProbes'
import { exprKey } from '../../core/scope/traceExpr'
import type { TraceExpr } from '../../core/scope/traceExpr'
import { Cursors } from './Cursors'
import type { CursorId } from './Cursors'
import { fmtHz, fmtT, fmtV } from './format'
import { CHART, DEFAULT_WINDOW, DEFAULT_Y_RANGE } from './geometry'
import { FftPlot } from './FftPlot'
import type { MathNodes } from './mathTrace'
import { differenceSeries } from './mathTrace'
import { MeasurementTable } from './MeasurementTable'
import { paneHeight, paneScales, panesForRender } from './paneLayout'
import {
  addPane,
  createLayout,
  moveTrace,
  removePane,
  setPaneYRange,
  syncLayout,
} from './panes'
import { ScopeLegend } from './ScopeLegend'
import { ScopePane } from './ScopePane'
import { ScopeToolbar } from './ScopeToolbar'
import { sweepHeadTime } from './sweep'
import {
  buildCurrentTraces,
  buildPowerTraces,
  buildVoltageTraces,
  dcOffsets,
  rangeOf,
} from './traceSeries'
import { triggerTime } from './trigger'
import { useScopeControls } from './useScopeControls'
import { useSweep } from './useSweep'
import { XYPlot } from './XYPlot'

/**
 * オシロ相当の波形ビュー。時間 / XY / FFT の表示切替に加え、目盛り・自動測定・
 * カーソル (Tier1)、段組み・振幅・Math・参照 (Tier2)、エッジトリガ・AC・掃引
 * (Tier3) を持つ。
 *
 * ここは組み立て役に徹し、系列の作り方は `traceSeries` / `polyline`、つまみの
 * 状態は `useScopeControls`、描画は `TimePlot` / `ScopeToolbar` / `ScopeLegend`
 * に分かれている。
 */

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
  /**
   * blockId → 電流系列[A]。渡すと同じ枠内に電流トレースを重ねる(overlay は右 mA 軸に
   * 破線、段組みは 1 レーンずつ)。ライブ(LiveScopePanel)専用。
   */
  currents?: Readonly<Record<string, readonly number[]>>
  /** 描く電力の式 (Alt+クリックで当てたもの)。評価はここで行う */
  powerExprs?: readonly TraceExpr[]
  /** blockId → 電流/電力トレースの表示名 */
  currentLabels?: Readonly<Record<string, string>>
  /** 凡例クリックでそのプローブを外す (渡さなければ凡例は表示のみ) */
  onRemoveTrace?: (expr: TraceExpr) => void
  /** ボードで選択中の素子。電流トレースを太線＋他を薄くして強調 */
  selectedBlockId?: string | null
  /** このオシロ画面の見出し (例: "オシロ 1")。複数画面のときに表示 */
  title?: string
  /** ヘッダの × でこの画面を閉じられるか (最後の 1 枚は閉じさせない) */
  canRemove?: boolean
  onRemove?: () => void
}

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
  currents,
  powerExprs,
  currentLabels,
  onRemoveTrace,
  selectedBlockId,
  title,
  canRemove = false,
  onRemove,
}: WaveformChartProps): ReactElement => {
  const svgRef = useRef<SVGSVGElement>(null)
  const c = useScopeControls()
  const hasData = waveforms != null && probes.length > 0

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
  const xX = c.xySel.x && visibleIds.includes(c.xySel.x) ? c.xySel.x : preferredIds[0] ?? ''
  const xY =
    c.xySel.y && visibleIds.includes(c.xySel.y)
      ? c.xySel.y
      : preferredIds[1] ?? preferredIds[0] ?? ''
  const fftId = c.fftSel && visibleIds.includes(c.fftSel) ? c.fftSel : preferredIds[0] ?? ''

  // トリガ: 支配ノードの中点を最初に横切る時刻へ窓の左端を合わせる
  const win = useMemo(() => {
    if (!hasData) return DEFAULT_WINDOW
    const base = viewWindow(waveforms, probes)
    if (!c.trigOn) return base
    const src = dominantOscillation(waveforms, probes)
    const nodeId = src?.nodeId ?? visibleIds[0]
    if (!nodeId) return base
    const vals = waveforms.nodeVoltages[nodeId]
    const { lo, hi } = rangeOf(vals)
    const t = triggerTime(waveforms.time, vals, (lo + hi) / 2, c.trigSlope)
    if (t == null) return base
    const span = base.end - base.start
    const end = Math.min(waveforms.time.at(-1) ?? t + span, t + span)
    return { start: t, end }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, waveforms, probes, c.trigOn, c.trigSlope])

  // AC カップリング: 各系列から DC (平均) を引いて描く
  const dc = useMemo(
    () => (waveforms ? dcOffsets(waveforms, probes) : new Map<string, number>()),
    [waveforms, probes],
  )

  // 掃引輝点: 時間ビューでのみ。演算(ngspice)とは無関係に 60fps で位相を進め、
  // 取得済み波形を左→右へ掃引再生する (DSO の掃引を模す)
  const sweeping = hasData && c.view === 'time' && c.sweepOn
  const phase = useSweep(sweeping, c.sweepSec)
  const tHead = sweepHeadTime(win, phase)

  const mathValues = useMemo(() => {
    if (!waveforms || !mathNodes) return null
    const a = waveforms.nodeVoltages[mathNodes.a]
    const b = waveforms.nodeVoltages[mathNodes.b]
    return a && b ? differenceSeries(a, b) : null
  }, [waveforms, mathNodes])

  const traces = useMemo(
    () =>
      waveforms
        ? buildVoltageTraces({ waveforms, visible, ac: c.ac, dc, mathNodes, mathValues })
        : [],
    [waveforms, visible, c.ac, dc, mathNodes, mathValues],
  )
  const currentTraces = useMemo(
    () => (currents ? buildCurrentTraces(currents, currentLabels) : []),
    [currents, currentLabels],
  )
  const powerTraces = useMemo(
    () =>
      waveforms && powerExprs?.length
        ? buildPowerTraces(powerExprs, waveforms, currentLabels)
        : [],
    [waveforms, powerExprs, currentLabels],
  )
  const drawTraces = useMemo(
    () => (hasData ? [...traces, ...currentTraces, ...powerTraces] : []),
    [hasData, traces, currentTraces, powerTraces],
  )

  // --- ペイン (LTspice のプロットペイン)。X 軸は共通、Y 軸はペインごと ---
  const [layout, setLayout] = useState(createLayout)
  const synced = useMemo(
    () => syncLayout(layout, drawTraces.map((t) => t.expr)),
    [layout, drawTraces],
  )
  if (synced !== layout) setLayout(synced)
  const height = paneHeight(synced.panes.length)
  const panes = useMemo(
    () => panesForRender(synced, drawTraces, win, height, c.gain, DEFAULT_Y_RANGE),
    [synced, drawTraces, win, height, c.gain],
  )
  // カーソル・XY・FFT は先頭ペインの座標系で扱う
  const scales = panes[0]?.scales ?? paneScales(win, DEFAULT_Y_RANGE, height)

  const cursorsUsable = hasData && c.view === 'time'
  const toSvg = (e: PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CHART.W,
      y: ((e.clientY - rect.top) / rect.height) * height,
    }
  }
  const grab = (id: CursorId, e: PointerEvent): void => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    c.setDragging(id)
  }
  const onMove = (e: PointerEvent): void => {
    if (!c.dragging) return
    const { x, y } = toSvg(e)
    const t = scales.tFromX(x)
    const v = scales.vFromY(y)
    c.setCursor((cur) =>
      c.dragging === 'tA'
        ? { ...cur, tA: t }
        : c.dragging === 'tB'
          ? { ...cur, tB: t }
          : c.dragging === 'vA'
            ? { ...cur, vA: v }
            : { ...cur, vB: v },
    )
  }

  const time = waveforms?.time ?? []
  const dt = Math.abs(c.cursor.tB - c.cursor.tA)
  const dv = Math.abs(c.cursor.vB - c.cursor.vA)
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

  // 「準備中…」「基準ノードが無い」などの帯。先頭ペイン (時間以外は本体) に重ねる
  const statusOverlay = status ? (
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
  ) : null

  return (
    <div className="wave-wrap">
      {title && (
        <div className="scope-head">
          <span className="scope-title">{title}</span>
          {canRemove && (
            <button
              type="button"
              className="scope-remove"
              onClick={onRemove}
              aria-label={`${title} を閉じる`}
              title="この画面を閉じる"
            >
              ×
            </button>
          )}
        </div>
      )}
      {c.view === 'time' ? (
        panes.map((p, i) => (
          <ScopePane
            key={p.pane.id}
            pane={p.pane}
            traces={p.traces}
            scales={p.scales}
            height={height}
            time={hasData ? time : []}
            leftUnit={p.leftUnit}
            rightUnit={p.rightUnit}
            rightAxis={p.rightAxis}
            rightScale={p.rightScale}
            sweeping={sweeping}
            tHead={tHead}
            reference={hasData ? reference : null}
            selectedBlockId={selectedBlockId}
            canRemove={panes.length > 1}
            onRemove={() => setLayout((l) => removePane(l, p.pane.id))}
            onMoveTrace={(key) =>
              setLayout((l) => {
                const trace = l.traces.find((t) => exprKey(t.expr) === key)
                if (!trace) return l
                const order = l.panes.findIndex((x) => x.id === p.pane.id)
                const next = l.panes[(order + 1) % l.panes.length]
                return moveTrace(l, trace.id, next.id)
              })
            }
            onSetYRange={(range) =>
              setLayout((l) => setPaneYRange(l, p.pane.id, range))
            }
            svgRef={i === 0 ? svgRef : undefined}
            onPointerMove={i === 0 ? onMove : undefined}
            onPointerUp={i === 0 ? () => c.setDragging(null) : undefined}
            overlay={
              i === 0 ? (
                <>
                  {c.cursorsOn && cursorsUsable && (
                    <Cursors scales={p.scales} cursor={c.cursor} onGrab={grab} />
                  )}
                  {statusOverlay}
                </>
              ) : undefined
            }
          />
        ))
      ) : (
        <svg
          className="waveform"
          viewBox={`0 0 ${CHART.W} ${height}`}
          role="img"
        >
          {c.view === 'xy' && hasData && xX && xY && (
            <XYPlot
              waveforms={waveforms}
              xId={xX}
              yId={xY}
              xLabel={labelOf(xX)}
              yLabel={labelOf(xY)}
            />
          )}
          {c.view === 'fft' && hasData && fftId && (
            <FftPlot
              waveforms={waveforms}
              nodeId={fftId}
              color={colorOf(fftId)}
              label={labelOf(fftId)}
            />
          )}
          {statusOverlay}
        </svg>
      )}

      <ScopeToolbar
        controls={c}
        hasData={hasData}
        cursorsUsable={cursorsUsable}
        onAddPane={() => setLayout(addPane)}
        onToggleCursors={() =>
          c.cursorsOn ? c.disableCursors() : c.enableCursors(win, scales.yRange)
        }
        visible={visible}
        xX={xX}
        xY={xY}
        fftId={fftId}
        reference={!!reference}
        onSaveReference={onSaveReference}
        onClearReference={onClearReference}
        readouts={
          <>
            {c.cursorsOn && cursorsUsable && (
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
          </>
        }
      />

      <ScopeLegend
        probes={probes}
        hidden={hidden}
        onToggle={onToggle}
        currentTraces={[...currentTraces, ...powerTraces]}
        onRemoveTrace={onRemoveTrace}
        selectedBlockId={selectedBlockId}
      />

      {hasData && c.view === 'time' && (
        <MeasurementTable waveforms={waveforms} probes={probes} hidden={hidden} />
      )}
    </div>
  )
}
