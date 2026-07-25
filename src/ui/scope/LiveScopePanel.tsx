import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../../core/netlist/build'
import type { DeviceKind } from '../../core/parts/types'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { ScopeStream } from '../../core/simulation/streamPort'
import { createScopeStream } from '../../io/scopeStreamEngine'
import { selectProbes } from '../waveProbes'
import { CurrentTrace } from './CurrentTrace'
import { createLiveBuffer } from './liveBuffer'
import { selectedMathNodes } from './mathTrace'
import { WaveformChart } from './WaveformChart'

/**
 * ライブ連続オシロ(本物のリアルタイム掃引)。libngspice(shared mode)の連続 `.tran` を
 * worker で回し、`SendData` の各点をリングバッファへ流し込み、60fps で電圧を
 * {@link WaveformChart}、電流を {@link CurrentTrace} に描く。実行中に抵抗値の alter や
 * スイッチの ON/OFF をすると、走っている波形・電流がその場で変わる。
 */

const STEP = 0.005 // .tran 最大刻み [s]
const HORIZON = 60 // 1 本の .tran の上限 [s] (ngspice 内部 plot が伸びるので現実値に)
const INTERVAL = 0.05 // breakpoint 間隔(制御点)[s]
const WINDOW_SEC = 2 // 表示窓 [s]
const CAPACITY = 200_000 // リングバッファ容量(有界メモリ)
const TIMEBASES = [0.5, 1, 2, 4]
const SW_CLOSED_OHMS = 0.001 // スイッチ閉(serialize.ts と一致)
const SW_OPEN_OHMS = 1e9 // スイッチ開

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
  /** ボードで選択中の素子。両端電圧(Math)と電流を強調する */
  selectedBlockId?: string | null
}

export const LiveScopePanel = ({
  netlist,
  title,
  selectedBlockId,
}: LiveScopePanelProps): ReactElement => {
  const [running, setRunning] = useState(false)
  const [waveforms, setWaveforms] = useState<Waveforms | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [timebase, setTimebase] = useState(1)
  const [showCurrent, setShowCurrent] = useState(true)
  const [swClosed, setSwClosed] = useState<Record<string, boolean>>({})

  const bufRef = useRef(createLiveBuffer(CAPACITY))
  const streamRef = useRef<ScopeStream | null>(null)
  const rafRef = useRef(0)

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
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // アンマウント時に確実に停止(worker を放置しない)
  useEffect(
    () => () => {
      streamRef.current?.stop()
      cancelAnimationFrame(rafRef.current)
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
  // 選択素子の両端電圧(V(a)-V(b))を白い Math トレースで重ねる
  const mathNodes = useMemo(
    () => (selectedBlockId ? selectedMathNodes(netlist, selectedBlockId) : null),
    [netlist, selectedBlockId],
  )

  const onToggle = (nodeId: string): void =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })

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
        <label style={{ marginLeft: 8, fontSize: 12, opacity: 0.9 }}>
          <input
            type="checkbox"
            checked={showCurrent}
            onChange={(e) => setShowCurrent(e.target.checked)}
          />{' '}
          電流表示
        </label>
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
        onToggle={onToggle}
        status={status}
        mathNodes={mathNodes}
        title={title}
      />

      {showCurrent && (
        <div>
          <div style={{ fontSize: 12, opacity: 0.75, margin: '2px 0' }}>電流 (mA)</div>
          <CurrentTrace
            time={waveforms?.time ?? []}
            currents={waveforms?.elementCurrents ?? {}}
            labels={deviceLabels}
            selectedBlockId={selectedBlockId}
          />
        </div>
      )}
    </div>
  )
}
