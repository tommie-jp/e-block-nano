import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../../core/netlist/build'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { ScopeStream } from '../../core/simulation/streamPort'
import { createScopeStream } from '../../io/scopeStreamEngine'
import { selectProbes } from '../waveProbes'
import { createLiveBuffer } from './liveBuffer'
import { WaveformChart } from './WaveformChart'

/**
 * ライブ連続オシロ(本物のリアルタイム掃引)。既存のバッチ版 WaveformPanel とは別物で、
 * libngspice(shared mode)の連続 `.tran` を worker で回し、`SendData` の各点を
 * リングバッファへ流し込み、60fps で {@link WaveformChart} に窓を描く。
 * 実行中に抵抗値を alter すると、走っている波形がその場で変わる。
 */

const STEP = 0.005 // .tran 最大刻み [s]
const HORIZON = 60 // 1 本の .tran の上限 [s] (ngspice 内部 plot が伸びるので現実値に)
const INTERVAL = 0.05 // breakpoint 間隔(制御点)[s]
const WINDOW_SEC = 2 // 表示窓 [s]
const CAPACITY = 200_000 // リングバッファ容量(有界メモリ)
const TIMEBASES = [0.5, 1, 2, 4]

interface LiveScopePanelProps {
  netlist: Netlist
  title?: string
}

export const LiveScopePanel = ({ netlist, title }: LiveScopePanelProps): ReactElement => {
  const [running, setRunning] = useState(false)
  const [waveforms, setWaveforms] = useState<Waveforms | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [timebase, setTimebase] = useState(1)

  const bufRef = useRef(createLiveBuffer(CAPACITY))
  const streamRef = useRef<ScopeStream | null>(null)
  const rafRef = useRef(0)

  const canRun = netlist.groundNode !== null

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
      // WaveformChart は time 0 起点前提なので、窓の左端を 0 にシフトして描画
      const t0 = w.time.length > 0 ? w.time[0] : 0
      setWaveforms(
        t0 > 0
          ? { time: w.time.map((t) => t - t0), nodeVoltages: w.nodeVoltages }
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

  const probes = useMemo(() => (waveforms ? selectProbes(waveforms) : []), [waveforms])

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
  // status は中央オーバーレイ。波形が出たら null にして線を隠さない
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
      </div>

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
        title={title}
      />
    </div>
  )
}
