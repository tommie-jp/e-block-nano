import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../core/netlist/build'
import type { SimulationPort } from '../core/simulation/port'
import { resampleToAudio } from '../core/simulation/spice/audio'
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
// 音を鳴らすときの目標基本周波数 [Hz] (低速の発振をここへピッチシフト)
const AUDIO_TARGET_HZ = 330

const SERIES_COLORS = ['#4fc3f7', '#ff8a65', '#81c784', '#ba68c8', '#fff176']
// 描画点の上限。過渡は適応ステップで数万点になる (マルチバイブレータ ~5万点)
const MAX_POINTS = 1000

/** 波形を単純な折れ線 SVG にする */
const Chart = ({ waveforms }: { waveforms: Waveforms }): ReactElement => {
  const { time, nodeVoltages } = waveforms
  const maxT = time.at(-1) || 1
  const series = Object.entries(nodeVoltages).filter(([, v]) => v.some((x) => x !== 0))
  // 大きな配列を spread すると stack overflow するのでループで最大値を取る
  let maxV = 1
  for (const [, v] of series) {
    for (const val of v) {
      const a = Math.abs(val)
      if (a > maxV) maxV = a
    }
  }
  const x = (t: number): number => PAD + (t / maxT) * (W - 2 * PAD)
  const y = (v: number): number => H - PAD - (v / maxV) * (H - 2 * PAD)
  // 点数が多い過渡は描画用に間引く (1 ピクセル 1〜2 点で十分)
  const stride = Math.max(1, Math.ceil(time.length / MAX_POINTS))
  const pointsFor = (values: number[]): string => {
    const parts: string[] = []
    for (let j = 0; j < values.length; j += stride) {
      parts.push(`${x(time[j])},${y(values[j])}`)
    }
    return parts.join(' ')
  }

  return (
    <svg className="waveform" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="wave-axis" />
      {series.map(([nodeId, values], i) => (
        <polyline
          key={nodeId}
          className="wave-line"
          stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
          points={pointsFor(values)}
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
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  const analysis = useMemo(
    () => ({ kind: 'tran' as const, step: TRAN_STEP, stop: TRAN_STOP }),
    [],
  )

  const stopAudio = (): void => {
    audioRef.current?.close().catch(() => {})
    audioRef.current = null
    setPlaying(false)
  }

  /**
   * 表示中の波形(最も振幅の大きい=発振しているノード)を Web Audio で鳴らす
   * トグル。再生中に押すと止める。発振が低速(数Hz)でもそのままでは聞こえない
   * ので、基本周波数を推定して可聴域(AUDIO_TARGET_HZ)へ playbackRate で
   * ピッチシフトする。
   */
  const togglePlay = (): void => {
    if (playing) {
      stopAudio()
      return
    }
    if (!waveforms) return
    setPlaying(true)
    setError(null)
    try {
      const wf = waveforms
      // ループで振幅を求める (大配列の spread は stack overflow するため)
      const range = (s: number[]): { lo: number; hi: number } => {
        let lo = Infinity
        let hi = -Infinity
        for (const v of s) {
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
        return { lo, hi }
      }
      const osc = Object.values(wf.nodeVoltages).reduce((a, b) => {
        const ra = range(a)
        const rb = range(b)
        return rb.hi - rb.lo > ra.hi - ra.lo ? b : a
      })
      // 中点交差から基本周波数を推定
      const { lo, hi } = range(osc)
      const mid = (lo + hi) / 2
      let crossings = 0
      for (let i = 1; i < osc.length; i++) {
        if ((osc[i - 1] - mid) * (osc[i] - mid) < 0) crossings++
      }
      const span = (wf.time.at(-1) ?? 0) - wf.time[0]
      const freq = span > 0 ? crossings / 2 / span : 0
      if (freq <= 0) {
        setError('発振が検出できません(この回路は音になりません)')
        setPlaying(false)
        return
      }
      const ctx = new AudioContext()
      audioRef.current = ctx
      const pcm = resampleToAudio(wf.time, osc, ctx.sampleRate)
      const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate)
      buffer.getChannelData(0).set(pcm)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      src.playbackRate.value = Math.min(500, Math.max(1, AUDIO_TARGET_HZ / freq))
      const gain = ctx.createGain()
      gain.gain.value = 0.2 // 矩形波は大きいので絞る
      src.connect(gain).connect(ctx.destination)
      src.start()
      src.stop(ctx.currentTime + 1.5) // 最長 1.5 秒で自動停止
      src.onended = () => {
        if (audioRef.current === ctx) stopAudio()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPlaying(false)
    }
  }

  // パネルを閉じる / アンマウント時は再生中の音を止める
  useEffect(() => {
    if (!open && audioRef.current) stopAudio()
    return () => {
      audioRef.current?.close().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
        <button
          type="button"
          className="toggle"
          aria-pressed={open}
          onClick={() => setOpen((o) => !o)}
        >
          波形 (過渡解析)
        </button>
        {open && !hasError && (
          <button
            type="button"
            className="toggle"
            aria-pressed={playing}
            disabled={!playing && !waveforms}
            onClick={togglePlay}
          >
            {playing ? '■ 停止' : '▶ 音を鳴らす'}
          </button>
        )}
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
