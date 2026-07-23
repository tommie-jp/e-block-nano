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
import { BoardView } from './BoardView'
import { PartsPalette } from './PartsPalette'
import { SimulatorPanel } from './SimulatorPanel'

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)

const BOARD_ROWS = 6
const BOARD_COLS = 8

export const App = (): ReactElement => {
  const editor = useBoardEditor(BOARD_ROWS, BOARD_COLS)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
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

  const netlist = useMemo(() => buildNetlist(editor.board), [editor.board])
  const findings = useMemo(() => lintCircuit(netlist), [netlist])
  const hasError = findings.some((f) => f.severity === 'error')

  // error がなければスタブへ流す (将来 CircuitJS1/ngspice-wasm に差し替え)。
  // error 時はシミュレータを呼ばず、lint を直せば動く状態にする gating。
  useEffect(() => {
    if (hasError) {
      setSimResult(null)
      return
    }
    let cancelled = false
    stubSimulator
      .simulate(netlist)
      .then((r) => {
        if (!cancelled) setSimResult(r)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSimResult({
            status: 'not-implemented',
            summary: `シミュレーション失敗: ${e instanceof Error ? e.message : String(e)}`,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [netlist, hasError])

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
              disabled={!editor.selectedIsSwitch}
              onClick={editor.toggleSelected}
            >
              SW 切替 (C)
            </button>
            <button
              type="button"
              disabled={!editor.selectedBlockId}
              onClick={editor.removeSelected}
            >
              削除 (Del)
            </button>
            <span className="status">
              ブロック: {editor.board.placements.length} / ネット:{' '}
              {netlist.nets.length} / 素子: {netlist.elements.length}
              {hasError
                ? ' — ⚠ 回路を修正してください'
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
          <SimulatorPanel netlist={netlist} hasError={hasError} />
        </div>
      </main>
    </div>
  )
}
