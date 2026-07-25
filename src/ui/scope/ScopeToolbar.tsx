import type { ReactElement, ReactNode } from 'react'
import type { NodeProbe } from '../waveProbes'
import { GAINS } from './useScopeControls'
import type { ScopeControls, View } from './useScopeControls'

interface ScopeToolbarProps {
  controls: ScopeControls
  hasData: boolean
  /** カーソルが使えるか (時間ビューかつ重ね表示のときだけ) */
  cursorsUsable: boolean
  /** カーソルの ON/OFF。ON にするとき窓とレンジが要るので親が握る */
  onToggleCursors: () => void
  /** 空のペインを 1 枚足す (トレースはペイン見出しの札で移す) */
  onAddPane: () => void
  /** 式でトレースを足すダイアログの開閉 */
  onAddTrace: () => void
  addTraceOpen: boolean
  /** ズーム中か (Zoom Back / 全体表示を出すかの判断) */
  zoomed: boolean
  onZoomBack: () => void
  onZoomFit: () => void
  /** XY / FFT のソース候補 (表示中のノード) */
  visible: readonly NodeProbe[]
  xX: string
  xY: string
  fftId: string
  reference: boolean
  onSaveReference?: () => void
  onClearReference?: () => void
  /** カーソル読み取り値・Math 測定値など、右端に並べる表示 */
  readouts?: ReactNode
}

/** 表示モード + 時間ビューのつまみ。状態は {@link ScopeControls} が持つ */
export const ScopeToolbar = ({
  controls: c,
  hasData,
  cursorsUsable,
  onToggleCursors,
  onAddPane,
  onAddTrace,
  addTraceOpen,
  zoomed,
  onZoomBack,
  onZoomFit,
  visible,
  xX,
  xY,
  fftId,
  reference,
  onSaveReference,
  onClearReference,
  readouts,
}: ScopeToolbarProps): ReactElement => {
  const viewBtn = (v: View, text: string): ReactElement => (
    <button
      type="button"
      className="toggle"
      aria-pressed={c.view === v}
      disabled={!hasData}
      onClick={() => c.setView(v)}
    >
      {text}
    </button>
  )

  const sourceOptions = visible.map((p) => (
    <option key={p.nodeId} value={p.nodeId}>
      {p.label}
    </option>
  ))

  return (
    <>
      <div className="wave-controls">
        {viewBtn('time', '時間')}
        {viewBtn('xy', 'XY')}
        {viewBtn('fft', 'FFT')}
        {c.view === 'xy' && hasData && (
          <span className="src-picker">
            X
            <select
              value={xX}
              onChange={(e) => c.setXySel((s) => ({ ...s, x: e.target.value }))}
            >
              {sourceOptions}
            </select>
            Y
            <select
              value={xY}
              onChange={(e) => c.setXySel((s) => ({ ...s, y: e.target.value }))}
            >
              {sourceOptions}
            </select>
          </span>
        )}
        {c.view === 'fft' && hasData && (
          <span className="src-picker">
            対象
            <select value={fftId} onChange={(e) => c.setFftSel(e.target.value)}>
              {sourceOptions}
            </select>
            <button
              type="button"
              onClick={c.cycleFftWindow}
              title="FFT の窓関数を切り替える (Hann / Hamming / 矩形)"
            >
              窓: {c.fftWindow === 'hann' ? 'Hann' : c.fftWindow === 'hamming' ? 'Hamming' : '矩形'}
            </button>
          </span>
        )}
      </div>

      {c.view === 'time' && (
        <div className="wave-controls">
          <button
            type="button"
            disabled={!hasData}
            onClick={onAddPane}
            title="ペインを 1 枚増やす (トレースは見出しの札で移す)"
          >
            ペイン追加
          </button>
          <button
            type="button"
            className="toggle"
            aria-pressed={addTraceOpen}
            disabled={!hasData}
            onClick={onAddTrace}
            title="式でトレースを足す (V(N1)*I(blk-4) など)"
          >
            トレース追加
          </button>
          {zoomed && (
            <>
              <button type="button" onClick={onZoomBack} title="1 段階ズームを戻す">
                ズーム戻す
              </button>
              <button type="button" onClick={onZoomFit} title="自動レンジ (全体表示) に戻す">
                全体
              </button>
            </>
          )}
          <span className="gain-control">
            振幅
            <button
              type="button"
              disabled={!hasData || c.gain <= GAINS[0]}
              onClick={c.gainDown}
              aria-label="振幅を下げる"
            >
              −
            </button>
            ×{c.gain}
            <button
              type="button"
              disabled={!hasData || c.gain >= GAINS.at(-1)!}
              onClick={c.gainUp}
              aria-label="振幅を上げる"
            >
              +
            </button>
          </span>
          <button
            type="button"
            className="toggle"
            aria-pressed={c.ac}
            disabled={!hasData}
            onClick={c.toggleAc}
          >
            AC
          </button>
          <button
            type="button"
            className="toggle"
            aria-pressed={c.trigOn}
            disabled={!hasData}
            onClick={c.toggleTrig}
          >
            トリガ
          </button>
          {c.trigOn && (
            <button type="button" onClick={c.toggleSlope} aria-label="トリガのスロープ">
              {c.trigSlope === 'rising' ? '↑' : '↓'}
            </button>
          )}
          <button
            type="button"
            className="toggle"
            aria-pressed={c.sweepOn}
            disabled={!hasData}
            onClick={c.toggleSweep}
            title="取得済み波形を左→右へ掃引再生 (輝点がなぞる)"
          >
            掃引
          </button>
          {c.sweepOn && (
            <button
              type="button"
              onClick={c.cycleSweepSec}
              aria-label="掃引速度"
              title="掃引 1 周の秒数"
            >
              {c.sweepSec}s/掃引
            </button>
          )}
          <button
            type="button"
            className="toggle"
            aria-pressed={c.cursorsOn}
            disabled={!cursorsUsable}
            onClick={onToggleCursors}
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
          {readouts}
        </div>
      )}
    </>
  )
}
