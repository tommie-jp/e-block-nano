import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../core/netlist/build'
import type { SimulationPort } from '../core/simulation/port'
import { resampleToAudio } from '../core/simulation/spice/audio'
import type { Waveforms } from '../core/simulation/spice/mapResult'
import type { NodeProbe } from './waveProbes'
import { dominantOscillation, selectProbes } from './waveProbes'
import { WaveformChart } from './scope/WaveformChart'

interface WaveformPanelProps {
  netlist: Netlist
  hasError: boolean
  simulator: SimulationPort
  /** 表示中ノード (色つき) をボードに知らせる。●をノード位置に重ねる用 */
  onProbes?: (probes: NodeProbe[]) => void
}

// PoC 既定の過渡設定 (RC の τ=1s が収まる範囲)。将来サンプルごとに指定可
const TRAN_STEP = 0.02
const TRAN_STOP = 5
// 音を鳴らすときの目標基本周波数 [Hz] (低速の発振をここへピッチシフト)
const AUDIO_TARGET_HZ = 330

/**
 * 過渡解析(.tran)を on-demand 実行し、ノード電圧の時系列を折れ線表示する。
 * ngspice を裏に持つ (CircuitJS のライブビューとは別の、定量の波形ビュー)。
 */
export const WaveformPanel = ({
  netlist,
  hasError,
  simulator,
  onProbes,
}: WaveformPanelProps): ReactElement => {
  const [open, setOpen] = useState(false)
  const [waveforms, setWaveforms] = useState<Waveforms | null>(null)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 凡例クリックで非表示にしたノード。線もボードの●も消す
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const audioRef = useRef<AudioContext | null>(null)

  const analysis = useMemo(
    () => ({ kind: 'tran' as const, step: TRAN_STEP, stop: TRAN_STOP }),
    [],
  )

  // 表示中のノード (色つき)。パネルを閉じていれば空 → ボードの●も消える
  const probes = useMemo(
    () => (open && waveforms ? selectProbes(waveforms) : []),
    [open, waveforms],
  )
  // ボードの●は「見えている線」だけに合わせる (非表示は●も消す)
  const visibleProbes = useMemo(
    () => probes.filter((p) => !hidden.has(p.nodeId)),
    [probes, hidden],
  )
  useEffect(() => {
    onProbes?.(visibleProbes)
  }, [visibleProbes, onProbes])
  // アンマウント時はボードの●を消す
  useEffect(() => () => onProbes?.([]), [onProbes])

  const toggleHidden = (nodeId: string): void =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })

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
      // 波形クロップと同じ「支配的な発振ノード + 基本周波数」を再利用する
      const osc = dominantOscillation(wf, probes)
      if (!osc) {
        setError('発振が検出できません(この回路は音になりません)')
        setPlaying(false)
        return
      }
      const { freq } = osc
      const series = wf.nodeVoltages[osc.nodeId]
      const ctx = new AudioContext()
      audioRef.current = ctx
      const pcm = resampleToAudio(wf.time, series, ctx.sampleRate)
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
        ) : waveforms && probes.length > 0 ? (
          <WaveformChart
            waveforms={waveforms}
            probes={probes}
            hidden={hidden}
            onToggle={toggleHidden}
          />
        ) : waveforms ? (
          <p className="status">変化するノードがありません</p>
        ) : null)}
    </section>
  )
}
