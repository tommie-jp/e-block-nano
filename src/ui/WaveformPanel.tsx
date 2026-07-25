import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../core/netlist/build'
import type { SimulationPort } from '../core/simulation/port'
import { resampleToAudio } from '../core/simulation/spice/audio'
import type { Waveforms } from '../core/simulation/spice/mapResult'
import type { NodeProbe } from './waveProbes'
import { dominantOscillation, selectProbes } from './waveProbes'
import { WaveformChart } from './scope/WaveformChart'
import { selectedMathNodes } from './scope/mathTrace'
import { setSelectionDiff } from './scope/panes'
import type { ScopeLayout } from './scope/panes'
import type { Scope } from './scope/scopes'
import {
  appendScope,
  makeScope,
  removeScope,
  unionVisibleIds,
  withLayout,
  withReference,
} from './scope/scopes'

interface WaveformPanelProps {
  netlist: Netlist
  hasError: boolean
  simulator: SimulationPort
  /** 表示中ノード (色つき) をボードに知らせる。●をノード位置に重ねる用 */
  onProbes?: (probes: NodeProbe[]) => void
  /** 選択中ブロック。2 端子素子なら Math (両端電圧) の対象にする */
  selectedBlockId?: string | null
}

// PoC 既定の過渡設定 (RC の τ=1s が収まる範囲)。将来サンプルごとに指定可
const TRAN_STEP = 0.02
const TRAN_STOP = 5
// 音を鳴らすときの目標基本周波数 [Hz] (低速の発振をここへピッチシフト)
const AUDIO_TARGET_HZ = 330

/**
 * 過渡解析(.tran)を on-demand 実行し、ノード電圧の時系列を折れ線表示する。
 * ngspice を裏に持つ (連続実行の `ui/scope/LiveScopePanel` とは別の、on-demand の波形ビュー)。
 */
export const WaveformPanel = ({
  netlist,
  hasError,
  simulator,
  onProbes,
  selectedBlockId,
}: WaveformPanelProps): ReactElement => {
  const [open, setOpen] = useState(false)
  const [waveforms, setWaveforms] = useState<Waveforms | null>(null)
  const [busy, setBusy] = useState(false)
  // 計算中の推定進捗 [%]。ngspice は逐次進捗を出さないので経過時間ベースで擬似的に
  // 進める (速く立ち上がり ~92% で頭打ち、完了で 100%)。
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // オシロ画面のリスト。各画面はチャンネル選択(hidden)・参照波形を独立に持つ。
  // .tran の計算結果 (waveforms) は全画面で共有する (計算は 1 回きり)。
  const [scopes, setScopes] = useState<Scope[]>(() => [makeScope('scope-1')])
  // 画面追加のたびに増える連番 (安定した key と見出し用)
  const seqRef = useRef(1)
  const audioRef = useRef<AudioContext | null>(null)

  // 選択中 2 端子素子の両端ノード (Math 差動の対象)
  const mathNodes = useMemo(
    () => selectedMathNodes(netlist, selectedBlockId),
    [netlist, selectedBlockId],
  )

  // 選択素子が変わったら、各画面の Math (両端電圧) を差し替える
  useEffect(() => {
    setScopes((list) =>
      list.map((s) => withLayout(s, (l) => setSelectionDiff(l, mathNodes))),
    )
  }, [mathNodes])

  const analysis = useMemo(
    () => ({ kind: 'tran' as const, step: TRAN_STEP, stop: TRAN_STOP }),
    [],
  )

  // 表示する波形。回路エラー中は古い結果を出さない (null=空オシロ)
  const active = open && !hasError ? waveforms : null
  // 表示中のノード (色つき)。パネルを閉じていれば空 → ボードの●も消える
  const probes = useMemo(() => (active ? selectProbes(active) : []), [active])
  // ボードの●は「どれか 1 画面にでも映っているノード」に合わせる (全画面で非表示なら消す)
  const visibleProbes = useMemo(() => {
    const shown = new Set(unionVisibleIds(scopes, probes.map((p) => p.nodeId)))
    return probes.filter((p) => shown.has(p.nodeId))
  }, [probes, scopes])
  useEffect(() => {
    onProbes?.(visibleProbes)
  }, [visibleProbes, onProbes])
  // アンマウント時はボードの●を消す
  useEffect(() => () => onProbes?.([]), [onProbes])

  // --- オシロ画面の操作 (すべて immutable に scopes を更新) ---
  const updateLayout = (
    scopeId: string,
    update: (l: ScopeLayout) => ScopeLayout,
  ): void =>
    setScopes((list) =>
      list.map((s) => (s.id === scopeId ? withLayout(s, update) : s)),
    )
  const saveReference = (scopeId: string): void =>
    setScopes((list) =>
      list.map((s) => (s.id === scopeId ? withReference(s, waveforms) : s)),
    )
  const clearReference = (scopeId: string): void =>
    setScopes((list) =>
      list.map((s) => (s.id === scopeId ? withReference(s, null) : s)),
    )
  const addScope = (): void =>
    setScopes((list) => {
      seqRef.current += 1
      return appendScope(list, `scope-${seqRef.current}`)
    })
  const removeScopeById = (scopeId: string): void =>
    setScopes((list) => (list.length > 1 ? removeScope(list, scopeId) : list))

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

  // 擬似進捗: busy の間だけ 5%→92% へ漸近的に進め、完了時に 100% を一瞬見せる
  useEffect(() => {
    if (!busy) {
      setProgress((p) => (p > 0 ? 100 : 0))
      return
    }
    setProgress(5)
    let p = 5
    const iv = setInterval(() => {
      p += (92 - p) * 0.14
      setProgress(Math.min(92, Math.round(p)))
    }, 150)
    return () => clearInterval(iv)
  }, [busy])

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
      {open && (
        <div className="scope-stack">
          {scopes.map((s, i) => (
            <WaveformChart
              key={s.id}
              title={`オシロ ${i + 1}`}
              canRemove={scopes.length > 1}
              onRemove={() => removeScopeById(s.id)}
              waveforms={active}
              probes={probes}
              layout={s.layout}
              onLayout={(update) => updateLayout(s.id, update)}
              reference={s.reference}
              onSaveReference={() => saveReference(s.id)}
              onClearReference={() => clearReference(s.id)}
              progress={busy ? progress : null}
              status={
                hasError
                  ? '⚠ 回路を修正してください'
                  : busy
                    ? `${waveforms ? '計算中' : 'ngspice を準備中'}… ${progress}%`
                    : error
                      ? error
                      : active && probes.length === 0
                        ? '変化するノードがありません'
                        : null
              }
            />
          ))}
          <button
            type="button"
            className="scope-add"
            onClick={addScope}
            disabled={!active}
            title="同じ波形をもう 1 画面に表示し、チャンネルを振り分けられます"
          >
            ＋ オシロ画面を追加
          </button>
        </div>
      )}
    </section>
  )
}
