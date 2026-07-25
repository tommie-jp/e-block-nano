import { useState } from 'react'
import type { CursorId, CursorState } from './Cursors'
import type { FftWindow } from '../../core/simulation/spice/fft'
import { DEFAULT_SWEEP_SECONDS } from './sweep'
import type { Slope } from './trigger'

/** 表示モード: 時間 / XY (リサージュ) / FFT */
export type View = 'time' | 'xy' | 'fft'

/** 振幅つまみの段 (自動 Y レンジをこの倍率で拡大 = 縦ズーム) */
export const GAINS = [0.5, 1, 2, 4, 8]
/** 掃引 1 周にかける壁時計秒。ベンチ DSO の掃引速度つまみ相当 */
export const SWEEP_SECONDS = [0.5, 1, DEFAULT_SWEEP_SECONDS, 4]

/**
 * オシロのつまみ (表示モード・振幅・AC・トリガ・掃引・カーソル・XY/FFT の
 * ソース選択) をまとめた UI 状態。描画側から状態管理を切り離す。
 */
export interface ScopeControls {
  view: View
  setView: (v: View) => void
  gain: number
  gainUp: () => void
  gainDown: () => void
  ac: boolean
  toggleAc: () => void
  trigOn: boolean
  toggleTrig: () => void
  trigSlope: Slope
  toggleSlope: () => void
  sweepOn: boolean
  toggleSweep: () => void
  sweepSec: number
  cycleSweepSec: () => void
  cursorsOn: boolean
  cursor: CursorState
  setCursor: (update: (c: CursorState) => CursorState) => void
  /** 窓とレンジの 1/3・2/3 の位置にカーソルを置いて表示する */
  enableCursors: (
    win: { start: number; end: number },
    yRange: { min: number; max: number },
  ) => void
  disableCursors: () => void
  dragging: CursorId | null
  setDragging: (id: CursorId | null) => void
  xySel: { x: string; y: string }
  setXySel: (update: (s: { x: string; y: string }) => { x: string; y: string }) => void
  fftSel: string
  setFftSel: (id: string) => void
  /** FFT の窓関数 (Hann / Hamming / 矩形) */
  fftWindow: FftWindow
  cycleFftWindow: () => void
}

export const useScopeControls = (): ScopeControls => {
  const [view, setView] = useState<View>('time')
  const [gain, setGain] = useState(1)
  const [ac, setAc] = useState(false)
  const [trigOn, setTrigOn] = useState(false)
  const [trigSlope, setTrigSlope] = useState<Slope>('rising')
  const [sweepOn, setSweepOn] = useState(false)
  const [sweepSec, setSweepSec] = useState(DEFAULT_SWEEP_SECONDS)
  const [cursorsOn, setCursorsOn] = useState(false)
  const [cursor, setCursor] = useState<CursorState>({ tA: 0, tB: 0, vA: 0, vB: 0 })
  const [dragging, setDragging] = useState<CursorId | null>(null)
  const [xySel, setXySel] = useState<{ x: string; y: string }>({ x: '', y: '' })
  const [fftSel, setFftSel] = useState('')
  const [fftWindow, setFftWindow] = useState<FftWindow>('hann')

  return {
    view,
    setView,
    gain,
    gainUp: () =>
      setGain((g) => GAINS[Math.min(GAINS.length - 1, GAINS.indexOf(g) + 1)]),
    gainDown: () => setGain((g) => GAINS[Math.max(0, GAINS.indexOf(g) - 1)]),
    ac,
    toggleAc: () => setAc((v) => !v),
    trigOn,
    toggleTrig: () => setTrigOn((v) => !v),
    trigSlope,
    toggleSlope: () => setTrigSlope((s) => (s === 'rising' ? 'falling' : 'rising')),
    sweepOn,
    toggleSweep: () => setSweepOn((v) => !v),
    sweepSec,
    cycleSweepSec: () =>
      setSweepSec(
        (s) => SWEEP_SECONDS[(SWEEP_SECONDS.indexOf(s) + 1) % SWEEP_SECONDS.length],
      ),
    cursorsOn,
    cursor,
    setCursor,
    enableCursors: (win, yRange) => {
      const span = win.end - win.start
      const vSpan = yRange.max - yRange.min
      setCursor({
        tA: win.start + span * 0.33,
        tB: win.start + span * 0.66,
        vA: yRange.min + vSpan * 0.33,
        vB: yRange.min + vSpan * 0.66,
      })
      setCursorsOn(true)
    },
    disableCursors: () => setCursorsOn(false),
    dragging,
    setDragging,
    xySel,
    setXySel,
    fftSel,
    setFftSel,
    fftWindow,
    cycleFftWindow: () =>
      setFftWindow((w) => (w === 'hann' ? 'hamming' : w === 'hamming' ? 'rect' : 'hann')),
  }
}
