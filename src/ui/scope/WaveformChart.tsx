import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent, ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { measureSeries } from '../../core/simulation/spice/measure'
import type { NodeProbe } from '../waveProbes'
import { dominantOscillation, viewWindow } from '../waveProbes'
import { exprKey } from '../../core/scope/traceExpr'
import type { ExprSymbols } from '../../core/scope/parseExpr'
import { AddTraceDialog } from './AddTraceDialog'
import { intervalStats, readCursors } from './cursorReadout'
import { Cursors } from './Cursors'
import type { CursorId } from './Cursors'
import { fmtHz, fmtT, fmtV } from './format'
import { CHART, DEFAULT_WINDOW, DEFAULT_Y_RANGE } from './geometry'
import { FftPlot } from './FftPlot'
import { MeasurementTable } from './MeasurementTable'
import { paneHeight, paneScales, panesForRender } from './paneLayout'
import {
  addPane,
  addTrace,
  nextPaneId,
  moveTrace,
  removePane,
  removeTrace,
  setPaneYRange,
  syncNodes,
  toggleVisible,
} from './panes'
import type { ScopeLayout } from './panes'
import { ScopeLegend } from './ScopeLegend'
import { ScopePane } from './ScopePane'
import { ScopeToolbar } from './ScopeToolbar'
import { sweepHeadTime } from './sweep'
import { buildDrawTraces, dcOffsets, rangeOf } from './traceSeries'
import { triggerTime } from './trigger'
import { useScopeControls } from './useScopeControls'
import { useSweep } from './useSweep'
import { fitsWindow, popZoom, pushZoom, rectToView } from './zoom'
import type { ZoomView } from './zoom'
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
  /** 表示できるノード (色・ラベル・ほぼ一定かどうか)。ボードの●と対応する */
  probes: NodeProbe[]
  /** 何をどのペインに映すか。オシロ画面の持ち主 (App / WaveformPanel) が持つ */
  layout: ScopeLayout
  onLayout: (update: (l: ScopeLayout) => ScopeLayout) => void
  /** blockId → 素子の表示名 (電流・電力の凡例) */
  deviceLabels?: Readonly<Record<string, string>>
  /** 式で使える素子と、その両端ノード (電力の式を組むのに要る) */
  elementTerminals?: Readonly<Record<string, { a: string; b: string }>>
  status?: string | null
  /** 計算中の推定進捗 [%] (0-100)。null なら進捗バーを出さない */
  progress?: number | null
  reference?: Waveforms | null
  onSaveReference?: () => void
  onClearReference?: () => void
  /** ボードで選択中の素子。電流/電力トレースを太線＋他を薄くして強調 */
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
  layout,
  onLayout,
  deviceLabels,
  elementTerminals,
  status,
  progress,
  reference,
  onSaveReference,
  onClearReference,
  selectedBlockId,
  title,
  canRemove = false,
  onRemove,
}: WaveformChartProps): ReactElement => {
  const svgRef = useRef<SVGSVGElement>(null)
  const c = useScopeControls()
  const hasData = waveforms != null && probes.length > 0

  // 凡例 Shift+クリックでカーソルを吸着させるトレース (LTspice の Attach Cursor)
  const [cursorTraceKey, setCursorTraceKey] = useState<string | null>(null)
  // 凡例 Ctrl+クリックで平均・RMS を出すトレース
  const [statsKey, setStatsKey] = useState<string | null>(null)

  // --- トレース追加 (式エディタ) ---
  const [addOpen, setAddOpen] = useState(false)
  // 選択中のペイン = 追加したトレースの行き先 (LTspice の active pane)
  const [activePaneId, setActivePaneId] = useState<string | null>(null)
  const symbols: ExprSymbols = useMemo(
    () => ({
      node: (name) =>
        probes.find((p) => p.label === name || p.nodeId === name)?.nodeId ?? null,
      block: (name) =>
        Object.keys(elementTerminals ?? {}).find(
          (id) => id === name || deviceLabels?.[id] === name,
        ) ?? null,
      terminals: (blockId) => elementTerminals?.[blockId] ?? null,
    }),
    [probes, deviceLabels, elementTerminals],
  )
  const quantities = useMemo(
    () => [
      ...probes.map((p) => `V(${p.label})`),
      ...Object.keys(elementTerminals ?? {}).flatMap((id) => [`I(${id})`, `P(${id})`]),
    ],
    [probes, elementTerminals],
  )

  // --- ズーム (矩形ドラッグ / Zoom Back / 全体表示) ---
  const [zoom, setZoom] = useState<ZoomView | null>(null)
  const [zoomStack, setZoomStack] = useState<readonly ZoomView[]>([])
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null)

  // 回路のノード集合にレイアウトを追従させる (新しいノードは自動で 1 本増える)
  const nodeKey = probes.map((p) => p.nodeId).join('|')
  useEffect(() => {
    onLayout((l) => syncNodes(l, nodeKey ? nodeKey.split('|') : []))
    // onLayout は毎レンダー作り直される呼び出し側があるので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey])

  // 凡例・XY/FFT のソース候補は「電圧トレースとして見えているノード」
  const shownNodes = useMemo(() => {
    const ids = new Set(
      layout.traces
        .filter((t) => t.expr.kind === 'v' && t.visible)
        .map((t) => (t.expr.kind === 'v' ? t.expr.node : '')),
    )
    return ids
  }, [layout])
  const hidden = useMemo(
    () => new Set(probes.map((p) => p.nodeId).filter((id) => !shownNodes.has(id))),
    [probes, shownNodes],
  )
  const visible = useMemo(
    () => probes.filter((p) => shownNodes.has(p.nodeId)),
    [probes, shownNodes],
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
  const autoWin = useMemo(() => {
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

  // ズーム中はその窓を使う。データが入れ替わって窓が外れたら自動へ戻す
  const dataWin = {
    start: waveforms?.time[0] ?? 0,
    end: waveforms?.time.at(-1) ?? 0,
  }
  const zoomUsable = zoom !== null && (!hasData || fitsWindow(zoom.win, dataWin))
  const win = zoomUsable && zoom ? zoom.win : autoWin

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

  const drawTraces = useMemo(
    () =>
      waveforms
        ? buildDrawTraces(layout.traces.filter((t) => t.visible), {
            waveforms,
            probes,
            deviceLabels,
            ac: c.ac,
            dc,
          })
        : [],
    [waveforms, layout, probes, deviceLabels, c.ac, dc],
  )

  // --- ペイン (LTspice のプロットペイン)。X 軸は共通、Y 軸はペインごと ---
  // 選択が消えた (ペインを閉じた) ときは先頭に戻す
  const activePane =
    activePaneId && layout.panes.some((p) => p.id === activePaneId)
      ? activePaneId
      : layout.panes[0]?.id
  const height = paneHeight(layout.panes.length)
  const panes = useMemo(
    () => panesForRender(layout, drawTraces, win, height, c.gain, DEFAULT_Y_RANGE),
    [layout, drawTraces, win, height, c.gain],
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
  const startZoomDrag = (e: PointerEvent): void => {
    if (c.view !== 'time' || !hasData) return
    const pt = toSvg(e)
    svgRef.current?.setPointerCapture(e.pointerId)
    setDrag({ from: pt, to: pt })
  }
  const endZoomDrag = (e: PointerEvent): void => {
    c.setDragging(null)
    if (!drag) return
    const view = rectToView(drag.from, toSvg(e), scales)
    setDrag(null)
    if (!view) return
    setZoomStack((s) => pushZoom(s, view))
    setZoom(view)
    // 囲んだ縦幅をそのペインの手動 Y レンジにする (LTspice と同じ挙動)
    const paneId = panes[0]?.pane.id
    if (paneId) onLayout((l) => setPaneYRange(l, paneId, view.yRange))
  }
  const zoomBack = (): void => {
    const back = popZoom(zoomStack)
    setZoomStack(back.stack)
    setZoom(back.view)
    const paneId = panes[0]?.pane.id
    if (paneId) onLayout((l) => setPaneYRange(l, paneId, back.view?.yRange ?? null))
  }
  const zoomFit = (): void => {
    setZoomStack([])
    setZoom(null)
    onLayout((l) =>
      l.panes.reduce((acc, p) => setPaneYRange(acc, p.id, null), l),
    )
  }

  const grab = (id: CursorId, e: PointerEvent): void => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    c.setDragging(id)
  }
  const onMove = (e: PointerEvent): void => {
    if (drag) {
      setDrag({ ...drag, to: toSvg(e) })
      return
    }
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
  // カーソル: 吸着先があればその上の値を読む。無ければ従来の縦横カーソル
  const cursorTrace = drawTraces.find((t) => t.key === cursorTraceKey) ?? null
  const reading = readCursors(time, cursorTrace, c.cursor.tA, c.cursor.tB)
  const dt = reading?.dt ?? Math.abs(c.cursor.tB - c.cursor.tA)
  const dv = reading?.dv ?? Math.abs(c.cursor.vB - c.cursor.vA)
  // 平均・RMS: カーソルがあればその区間、無ければ表示中の窓全体
  const statsTrace = drawTraces.find((t) => t.key === statsKey) ?? null
  const stats = statsTrace
    ? intervalStats(
        time,
        statsTrace.values,
        c.cursorsOn ? c.cursor.tA : win.start,
        c.cursorsOn ? c.cursor.tB : win.end,
      )
    : null
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
  // 差動 (Math) トレースがあれば、その両端電圧の測定値を出す
  const mathTrace = drawTraces.find((t) => t.expr.kind === 'vdiff')
  const mathMeasure =
    mathTrace && waveforms ? measureSeries(waveforms.time, mathTrace.values) : null
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
            active={p.pane.id === activePane}
            onActivate={() => setActivePaneId(p.pane.id)}
            canRemove={panes.length > 1}
            onRemove={() => onLayout((l) => removePane(l, p.pane.id))}
            onMoveTrace={(key) =>
              onLayout((l) => {
                const trace = l.traces.find((t) => exprKey(t.expr) === key)
                if (!trace) return l
                const order = l.panes.findIndex((x) => x.id === p.pane.id)
                const next = l.panes[(order + 1) % l.panes.length]
                return moveTrace(l, trace.id, next.id)
              })
            }
            onSetYRange={(range) =>
              onLayout((l) => setPaneYRange(l, p.pane.id, range))
            }
            svgRef={i === 0 ? svgRef : undefined}
            onPointerDown={i === 0 ? startZoomDrag : undefined}
            onPointerMove={i === 0 ? onMove : undefined}
            onPointerUp={i === 0 ? endZoomDrag : undefined}
            zoomRect={
              i === 0 && drag
                ? {
                    x: Math.min(drag.from.x, drag.to.x),
                    y: Math.min(drag.from.y, drag.to.y),
                    width: Math.abs(drag.to.x - drag.from.x),
                    height: Math.abs(drag.to.y - drag.from.y),
                  }
                : null
            }
            overlay={
              i === 0 ? (
                <>
                  {c.cursorsOn && cursorsUsable && (
                    <Cursors
                      scales={p.scales}
                      cursor={c.cursor}
                      onGrab={grab}
                      attached={
                        reading && cursorTrace
                          ? {
                              color: cursorTrace.color,
                              vA: reading.vA,
                              vB: reading.vB,
                            }
                          : null
                      }
                    />
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
        onAddPane={() => {
          // 足したペインをそのまま選択する (次に追加するトレースはここへ入る)。
          // id は決定的なので、更新関数の外で先に決める (レンダー中の setState を避ける)
          setActivePaneId(nextPaneId(layout))
          onLayout(addPane)
        }}
        onAddTrace={() => setAddOpen((v) => !v)}
        addTraceOpen={addOpen}
        zoomed={zoom !== null}
        onZoomBack={zoomBack}
        onZoomFit={zoomFit}
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
                {cursorTrace ? `${cursorTrace.label}: ` : ''}
                Δt = {fmtT(dt)}
                {dt > 0 && <> / 1/Δt = {fmtHz(1 / dt)}</>} &nbsp; Δ = {fmtV(dv)}
                {reading?.slope != null && <> / 傾き {fmtV(reading.slope)}/s</>}
              </span>
            )}
            {stats && statsTrace && (
              <span className="math-readout">
                {statsTrace.label}: 平均 {fmtV(stats.avg)} / RMS {fmtV(stats.rms)}
                {c.cursorsOn ? ' (カーソル間)' : ' (表示区間)'}
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

      {addOpen && (
        <AddTraceDialog
          quantities={quantities}
          symbols={symbols}
          onAdd={(expr) => onLayout((l) => addTrace(l, expr, activePane))}
          onClose={() => setAddOpen(false)}
        />
      )}

      <ScopeLegend
        probes={probes}
        hidden={hidden}
        onSelectCursorTrace={(key) =>
          setCursorTraceKey((k) => (k === key ? null : key))
        }
        onSelectStatsTrace={(key) => setStatsKey((k) => (k === key ? null : key))}
        cursorTraceKey={cursorTraceKey}
        statsKey={statsKey}
        onToggle={(nodeId) =>
          onLayout((l) => {
            const t = l.traces.find(
              (x) => x.expr.kind === 'v' && x.expr.node === nodeId,
            )
            return t ? toggleVisible(l, t.id) : l
          })
        }
        currentTraces={drawTraces.filter(
          (t) => t.expr.kind !== 'v' && t.expr.kind !== 'vdiff',
        )}
        onRemoveTrace={(expr) =>
          onLayout((l) => {
            const t = l.traces.find((x) => exprKey(x.expr) === exprKey(expr))
            return t ? removeTrace(l, t.id) : l
          })
        }
        selectedBlockId={selectedBlockId}
      />

      {hasData && c.view === 'time' && (
        <MeasurementTable waveforms={waveforms} traces={drawTraces} win={win} />
      )}
    </div>
  )
}
