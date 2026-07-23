import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { buildNetlist } from '../core/netlist/build'
import type { SimulationResult } from '../core/simulation/port'
import { stubSimulator } from '../core/simulation/port'
import { useBoardEditor } from '../input/editor/useBoardEditor'
import { BoardView } from './BoardView'
import { PartsPalette } from './PartsPalette'

const BOARD_ROWS = 6
const BOARD_COLS = 8

export const App = (): ReactElement => {
  const editor = useBoardEditor(BOARD_ROWS, BOARD_COLS)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)

  const netlist = useMemo(() => buildNetlist(editor.board), [editor.board])

  // 配置が変わるたびにスタブへ流す (将来 CircuitJS1/ngspice-wasm に差し替え)
  useEffect(() => {
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
  }, [netlist])

  // キーボード操作: R = 回転, Delete/Backspace = 削除
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'r' || e.key === 'R') editor.rotateSelected()
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
          R キーか「回転」で回転 / Delete で削除
        </p>
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
              disabled={!editor.selectedBlockId}
              onClick={editor.removeSelected}
            >
              削除 (Del)
            </button>
            <span className="status">
              ブロック: {editor.board.placements.length} / ネット:{' '}
              {netlist.nets.length} / 素子: {netlist.elements.length}
              {simResult && ` — ${simResult.summary}`}
            </span>
          </div>
          {editor.message && <p className="error">{editor.message}</p>}
        </div>
      </main>
    </div>
  )
}
