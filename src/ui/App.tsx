import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { lintCircuit } from '../core/lint/lintCircuit'
import { buildNetlist } from '../core/netlist/build'
import type { SimulationResult } from '../core/simulation/port'
import { stubSimulator } from '../core/simulation/port'
import { useBoardEditor } from '../input/editor/useBoardEditor'
import {
  downloadBoard,
  loadFromLocal,
  readBoardFile,
  saveToLocal,
} from '../io/boardStorage'
import { createNgspiceSimulator } from '../io/ngspiceSimulator'
import { deserializeBoard } from '../core/persistence/boardFile'
import { getSample, SAMPLE_CIRCUITS } from '../fixtures/circuits/samples'
import { BoardView } from './BoardView'
import { PartsPalette } from './PartsPalette'
import { SimulatorPanel } from './SimulatorPanel'
import type { LiveCurrents } from './useCircuitJsLive'
import type { NodeProbe } from './waveProbes'
import { WaveformPanel } from './WaveformPanel'

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)

const BOARD_ROWS = 6
const BOARD_COLS = 8

export const App = (): ReactElement => {
  const editor = useBoardEditor(BOARD_ROWS, BOARD_COLS)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
  const [liveCurrents, setLiveCurrents] = useState<LiveCurrents | null>(null)
  const [waveProbes, setWaveProbes] = useState<NodeProbe[]>([])
  const [ngspiceOn, setNgspiceOn] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const ngspice = useMemo(() => createNgspiceSimulator(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = (): void => {
    try {
      saveToLocal(editor.board)
      editor.reportError('保存しました (ブラウザ内)')
    } catch (e) {
      editor.reportError(`保存失敗: ${errorMessage(e)}`)
    }
  }

  const handleLoad = (): void => {
    try {
      const board = loadFromLocal()
      if (!board) {
        editor.reportError('保存データがありません')
        return
      }
      editor.replaceBoard(board)
    } catch (e) {
      editor.reportError(`読込失敗: ${errorMessage(e)}`)
    }
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = '' // 同じファイルを連続選択できるようにする
    if (!file) return
    readBoardFile(file)
      .then((board) => editor.replaceBoard(board))
      .catch((err: unknown) =>
        editor.reportError(`インポート失敗: ${errorMessage(err)}`),
      )
  }

  const handleSampleSelect = (e: ChangeEvent<HTMLSelectElement>): void => {
    const id = e.target.value
    e.target.value = '' // プレースホルダに戻し、同じサンプルを連続選択できるように
    const sample = getSample(id)
    if (!sample) return
    // 盤面が空でなければ上書き確認 (サンプルは既存配置を置き換えるため)
    if (
      editor.board.placements.length > 0 &&
      !window.confirm('現在の配置を破棄してサンプルを読み込みますか?')
    ) {
      return
    }
    try {
      editor.replaceBoard(deserializeBoard(JSON.stringify(sample.data)))
      editor.reportError(`サンプル「${sample.name}」を読み込みました`)
    } catch (err) {
      editor.reportError(`サンプル読込失敗: ${errorMessage(err)}`)
    }
  }

  const netlist = useMemo(() => buildNetlist(editor.board), [editor.board])
  const findings = useMemo(() => lintCircuit(netlist), [netlist])
  const hasError = findings.some((f) => f.severity === 'error')
  // SW 切替トグルの押下状態 = 選択中スイッチが閉じているか
  const selectedSwitchClosed =
    editor.selectedIsSwitch &&
    (editor.board.placements.find((p) => p.blockId === editor.selectedBlockId)
      ?.state?.closed ??
      false)

  // error 時はシミュレータを呼ばず、lint を直せば動く状態にする gating。
  // ngspice(定量)は on-demand。off の間はスタブ(集計のみ)を流す。
  useEffect(() => {
    if (hasError) {
      setSimResult(null)
      return
    }
    const port = ngspiceOn ? ngspice : stubSimulator
    let cancelled = false
    if (ngspiceOn) setSimulating(true)
    port
      .simulate(netlist)
      .then((r) => {
        if (!cancelled) setSimResult(r)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSimResult({
            status: 'error',
            summary: `シミュレーション失敗: ${errorMessage(e)}`,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setSimulating(false)
      })
    return () => {
      cancelled = true
    }
  }, [netlist, hasError, ngspiceOn, ngspice])

  // キーボード操作: R = 回転, C = スイッチ切替, Delete/Backspace = 削除
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'r' || e.key === 'R') editor.rotateSelected()
      if (e.key === 'c' || e.key === 'C') editor.toggleSelected()
      if (e.key === 'Delete' || e.key === 'Backspace') editor.removeSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])

  return (
    <div className="app">
      <header className="header">
        <h1>e-block-nano PoC</h1>
        <p className="hint">
          パーツを選んでセルをクリックで配置 / ドラッグで移動 / クリックで選択 /
          R で回転 / C でスイッチ切替 / Delete で削除
        </p>
        <div className="file-actions">
          <button type="button" onClick={handleSave}>
            保存
          </button>
          <button type="button" onClick={handleLoad}>
            読込
          </button>
          <button type="button" onClick={() => downloadBoard(editor.board)}>
            エクスポート
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            インポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleImport}
          />
          <select
            className="sample-select"
            defaultValue=""
            onChange={handleSampleSelect}
            aria-label="サンプル回路を読み込む"
          >
            <option value="" disabled>
              サンプル回路…
            </option>
            {SAMPLE_CIRCUITS.map((s) => (
              <option key={s.id} value={s.id} title={s.description}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </header>
      <main className="main">
        <PartsPalette
          selectedPartId={editor.selectedPartId}
          onSelect={editor.selectPart}
        />
        <div className="board-area">
          <BoardView
            board={editor.board}
            selectedBlockId={editor.selectedBlockId}
            onCellClick={editor.handleCellClick}
            onBlockMove={editor.handleBlockMove}
            onBlockDoubleClick={editor.rotateBlockById}
            elementCurrents={
              // CircuitJS ライブビュー表示中はライブ電流を優先し、
              // それ以外は ngspice の動作点電流 (ON のときのみ)
              liveCurrents ??
              (ngspiceOn ? simResult?.elementCurrents : undefined)
            }
            probes={waveProbes}
          />
          <div className="toolbar">
            <button
              type="button"
              disabled={!editor.selectedBlockId}
              onClick={editor.rotateSelected}
            >
              回転 (R)
            </button>
            <button
              type="button"
              className="toggle"
              aria-pressed={selectedSwitchClosed}
              disabled={!editor.selectedIsSwitch}
              onClick={editor.toggleSelected}
            >
              SW {selectedSwitchClosed ? '閉' : '開'} (C)
            </button>
            <button
              type="button"
              disabled={!editor.selectedBlockId}
              onClick={editor.removeSelected}
            >
              削除 (Del)
            </button>
            <button
              type="button"
              className="toggle"
              aria-pressed={ngspiceOn}
              onClick={() => setNgspiceOn((v) => !v)}
            >
              ngspice で計算
            </button>
            <span className="status">
              ブロック: {editor.board.placements.length} / ネット:{' '}
              {netlist.nets.length} / 素子: {netlist.elements.length}
              {hasError
                ? ' — ⚠ 回路を修正してください'
                : simulating
                  ? ' — 計算中…'
                  : simResult && ` — ${simResult.summary}`}
            </span>
          </div>
          {findings.length > 0 && (
            <ul className="findings">
              {findings.map((f, i) => (
                <li key={`${f.code}-${i}`} className={`finding ${f.severity}`}>
                  {f.severity === 'error' ? '⛔' : '⚠'} {f.message}
                </li>
              ))}
            </ul>
          )}
          {editor.message && <p className="error">{editor.message}</p>}
          <SimulatorPanel
            netlist={netlist}
            hasError={hasError}
            onCurrents={setLiveCurrents}
          />
          <WaveformPanel
            netlist={netlist}
            hasError={hasError}
            simulator={ngspice}
            onProbes={setWaveProbes}
            selectedBlockId={editor.selectedBlockId}
          />
        </div>
      </main>
    </div>
  )
}
