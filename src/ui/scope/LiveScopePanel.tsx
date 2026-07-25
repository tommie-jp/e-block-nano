import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../../core/netlist/build'
import type { DeviceKind } from '../../core/parts/types'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { ScopeStream } from '../../core/simulation/streamPort'
import { createScopeStream } from '../../io/scopeStreamEngine'
import { selectProbes } from '../waveProbes'
import { createLiveBuffer } from './liveBuffer'
import type { LiveCurrents } from './liveBuffer'
import { powerExpr } from '../../core/scope/elementNodes'
import { diffNodes, probedCurrents, probedPowers } from './probeTraces'
import type { ProbeTrace } from './probeTraces'
import { WaveformChart } from './WaveformChart'

/**
 * ライブ連続オシロ(本物のリアルタイム掃引)。libngspice(shared mode)の連続 `.tran` を
 * worker で回し、`SendData` の各点をリングバッファへ流し込み、60fps で
 * {@link WaveformChart} に描く。実行中に抵抗値の alter やスイッチの ON/OFF を
 * すると、走っている波形・電流がその場で変わる。
 *
 * 何を映すかは親 (App) が持つプローブ一覧 ({@link ProbeTrace}) で決まる。
 * ボードの接点/素子を直接プローブする LTspice 流の操作系 (`ui/scope/probePick`)。
 */

const STEP = 0.005 // .tran 最大刻み [s]
const HORIZON = 60 // 1 本の .tran の上限 [s] (ngspice 内部 plot が伸びるので現実値に)
const INTERVAL = 0.05 // breakpoint 間隔(制御点)[s]
const WINDOW_SEC = 2 // 表示窓 [s]
const CAPACITY = 200_000 // リングバッファ容量(有界メモリ)
const TIMEBASES = [0.5, 1, 2, 4]
const SW_CLOSED_OHMS = 0.001 // スイッチ閉(serialize.ts と一致)
const SW_OPEN_OHMS = 1e9 // スイッチ開
// 描画は 60fps だが、ボード上の電流表示は目で追える程度に間引く
const BOARD_CURRENTS_INTERVAL_MS = 100
// 既定値を毎レンダー作らない (子の memo 依存が無駄に変わるため)
const NO_HIDDEN: ReadonlySet<string> = new Set()
const NO_TRACES: readonly ProbeTrace[] = []

const KIND_LABEL: Record<DeviceKind, string> = {
  battery: '電池',
  resistor: '抵抗',
  capacitor: 'コンデンサ',
  switch: 'スイッチ',
  led: 'LED',
  diode: 'ダイオード',
  'transistor-npn': 'トランジスタ',
}

interface LiveScopePanelProps {
  netlist: Netlist
  title?: string
  /** ボードで選択中の素子。電流トレースを強調する */
  selectedBlockId?: string | null
  /** ボードから当てたプローブ (電流・差動)。電圧は既定で全ノード表示 */
  traces?: readonly ProbeTrace[]
  /** 表示を消したノード (凡例トグル / 接点プローブ) */
  hidden?: ReadonlySet<string>
  onToggleHidden?: (nodeId: string) => void
  onToggleTrace?: (trace: ProbeTrace) => void
  /**
   * 走っている素子電流の瞬時値 (blockId → A)。ボード上のブロックに
   * 「いま流れている電流」を出すために親へ流す。停止中・未起動は null。
   */
  onLiveCurrents?: (currents: LiveCurrents | null) => void
}

export const LiveScopePanel = ({
  netlist,
  title,
  selectedBlockId,
  traces = NO_TRACES,
  hidden = NO_HIDDEN,
  onToggleHidden,
  onToggleTrace,
  onLiveCurrents,
}: LiveScopePanelProps): ReactElement => {
  const [running, setRunning] = useState(false)
  const [waveforms, setWaveforms] = useState<Waveforms | null>(null)
  const [timebase, setTimebase] = useState(1)
  const [swClosed, setSwClosed] = useState<Record<string, boolean>>({})

  const bufRef = useRef(createLiveBuffer(CAPACITY))
  const streamRef = useRef<ScopeStream | null>(null)
  const rafRef = useRef(0)
  // コールバックの同一性変化で tick / effect が再走しないよう ref 経由で持つ
  const onLiveCurrentsRef = useRef(onLiveCurrents)
  onLiveCurrentsRef.current = onLiveCurrents
  const lastCurrentsEmitRef = useRef(0)

  const canRun = netlist.groundNode !== null

  // 素子ラベル(電流トレースの凡例用) と、スイッチの初期 ON/OFF を netlist から
  const deviceLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of netlist.elements) m[e.blockId] = KIND_LABEL[e.device.kind]
    return m
  }, [netlist])
  const switches = useMemo(
    () => netlist.elements.filter((e) => e.device.kind === 'switch'),
    [netlist],
  )
  useEffect(() => {
    const init: Record<string, boolean> = {}
    for (const e of switches) init[e.blockId] = e.state?.closed ?? false
    setSwClosed(init)
  }, [switches])

  const stop = (): void => {
    streamRef.current?.stop()
    streamRef.current = null
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    onLiveCurrentsRef.current?.(null)
  }

  const start = (): void => {
    if (!canRun) return
    bufRef.current.clear()
    const stream = createScopeStream()
    streamRef.current = stream
    stream.onSample((s) => bufRef.current.push(s))
    stream.start(netlist, { step: STEP, horizon: HORIZON, intervalSec: INTERVAL })
    stream.setTimebase(timebase)
    setRunning(true)
    const tick = (): void => {
      const w = bufRef.current.toWindow(WINDOW_SEC)
      // WaveformChart / CurrentTrace は time 0 起点前提なので窓の左端を 0 にシフト
      const t0 = w.time.length > 0 ? w.time[0] : 0
      setWaveforms(
        t0 > 0
          ? {
              time: w.time.map((t) => t - t0),
              nodeVoltages: w.nodeVoltages,
              elementCurrents: w.elementCurrents,
            }
          : w,
      )
      // ボード上の電流表示へ最新 1 点を流す (描画より粗い間隔で十分)
      const now = performance.now()
      if (now - lastCurrentsEmitRef.current >= BOARD_CURRENTS_INTERVAL_MS) {
        lastCurrentsEmitRef.current = now
        onLiveCurrentsRef.current?.(bufRef.current.latestCurrents())
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // アンマウント時に確実に停止(worker を放置しない)
  useEffect(
    () => () => {
      streamRef.current?.stop()
      cancelAnimationFrame(rafRef.current)
      onLiveCurrentsRef.current?.(null)
    },
    [],
  )

  // timebase 変更を実行中のストリームへ反映
  useEffect(() => {
    streamRef.current?.setTimebase(timebase)
  }, [timebase])

  const toggleSwitch = (blockId: string): void => {
    const next = !swClosed[blockId]
    setSwClosed((s) => ({ ...s, [blockId]: next }))
    // スイッチは抵抗置換なので alter で ON(低抵抗)/OFF(高抵抗)を切り替える
    streamRef.current?.alter(blockId, next ? SW_CLOSED_OHMS : SW_OPEN_OHMS)
  }

  const probes = useMemo(() => (waveforms ? selectProbes(waveforms) : []), [waveforms])
  // 差動プローブ (接点 → 接点のドラッグ) を白い Math トレースで重ねる
  const mathNodes = useMemo(() => diffNodes(traces), [traces])
  // 電流は当てた素子だけ (LTspice と同じくプローブで選ぶ)
  const currents = useMemo(
    () => probedCurrents(traces, waveforms?.elementCurrents ?? {}),
    [traces, waveforms],
  )
  // 電力 (Alt+クリック) は式にして渡し、評価はオシロ側に任せる
  const powerExprs = useMemo(
    () =>
      probedPowers(traces)
        .map((blockId) => powerExpr(netlist, blockId))
        .filter((e) => e !== null),
    [traces, netlist],
  )

  const resistors = netlist.elements.filter((e) => e.device.kind === 'resistor')
  const latest = bufRef.current.latestTime()
  const hasData = !!waveforms && waveforms.time.length > 0
  const status = !canRun
    ? '基準ノード (GND) が無いため計算できません'
    : running && !hasData
      ? '準備中… (ngspice 起動)'
      : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={running ? stop : start} disabled={!canRun}>
          {running ? '■ STOP' : '● LIVE'}
        </button>
        {running && (
          <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
            t={(latest ?? 0).toFixed(2)}s
          </span>
        )}
        <span style={{ opacity: 0.8 }}>掃引速度</span>
        {TIMEBASES.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTimebase(tb)}
            style={{ fontWeight: tb === timebase ? 700 : 400 }}
          >
            {tb}x
          </button>
        ))}
        <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.75 }}>
          {traces.length === 0
            ? 'ボードの「プローブ」で 接点=電圧 / 素子=電流 / 接点→接点=差動'
            : `プローブ ${traces.length} 本 (凡例クリックで外す)`}
        </span>
      </div>

      {switches.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {switches.map((e) => (
            <button
              key={e.blockId}
              type="button"
              disabled={!running}
              onClick={() => toggleSwitch(e.blockId)}
              title="実行中にスイッチを開閉して電流変化を見る"
            >
              スイッチ {swClosed[e.blockId] ? '● 閉 (ON)' : '○ 開 (OFF)'}
            </button>
          ))}
        </div>
      )}

      {resistors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {resistors.map((e) => {
            if (e.device.kind !== 'resistor') return null
            return (
              <label key={e.blockId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ minWidth: 90, fontSize: 12, opacity: 0.85 }}>
                  {e.blockId} R
                </span>
                <input
                  type="range"
                  min={100}
                  max={10_000}
                  step={100}
                  defaultValue={e.device.ohms}
                  onChange={(ev) =>
                    streamRef.current?.alter(e.blockId, Number(ev.target.value))
                  }
                />
              </label>
            )
          })}
        </div>
      )}

      <WaveformChart
        waveforms={waveforms}
        probes={probes}
        hidden={hidden}
        onToggle={(nodeId) => onToggleHidden?.(nodeId)}
        status={status}
        mathNodes={mathNodes}
        currents={currents}
        powerExprs={powerExprs}
        currentLabels={deviceLabels}
        onRemoveTrace={(expr) => {
          if (expr.kind === 'i') onToggleTrace?.({ kind: 'current', blockId: expr.block })
          else if (expr.kind === 'p') onToggleTrace?.({ kind: 'power', blockId: expr.block })
          else if (expr.kind === 'vdiff')
            onToggleTrace?.({ kind: 'diff', a: expr.a, b: expr.b })
        }}
        selectedBlockId={selectedBlockId}
        title={title}
      />
    </div>
  )
}
