import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../core/netlist/build'
import { circuitJsUrl } from '../core/simulation/circuitjs/url'
import { CIRCUITJS_BASE } from '../io/circuitjsConfig'

interface SimulatorPanelProps {
  netlist: Netlist
  /** lint error があるか (ある間は実シミュレーションを呼ばない gating) */
  hasError: boolean
}

/**
 * CircuitJS1 (Falstad) を iframe で埋め込むライブビュー。
 * 回路テキストを `?cct=` に載せて渡す方式なので、netlist が変わるたび
 * iframe を再ロードして反映する (スイッチ開閉もここに乗る)。
 * ※ 変更のたび GWT アプリを再起動するため重い。将来は自前ホスト + JS API の
 *   importCircuit で無再ロード化する余地がある。
 */
export const SimulatorPanel = ({
  netlist,
  hasError,
}: SimulatorPanelProps): ReactElement => {
  const [open, setOpen] = useState(false)

  const url = useMemo(() => {
    if (hasError) return null
    try {
      return circuitJsUrl(netlist, CIRCUITJS_BASE)
    } catch {
      return null
    }
  }, [netlist, hasError])

  return (
    <section className="sim-panel">
      <div className="sim-head">
        <button type="button" onClick={() => setOpen((o) => !o)}>
          {open ? 'シミュレーション非表示' : 'シミュレーション表示'}
        </button>
        <span className="sim-note">CircuitJS1 で電流を可視化</span>
      </div>
      {open &&
        (hasError ? (
          <p className="error">⚠ 回路を修正してから実行してください</p>
        ) : url ? (
          <iframe className="sim-frame" title="CircuitJS1" src={url} />
        ) : (
          <p className="error">回路を変換できません</p>
        ))}
    </section>
  )
}
