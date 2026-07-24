import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Netlist } from '../core/netlist/build'
import {
  circuitJsBaseUrl,
  circuitJsUrl,
} from '../core/simulation/circuitjs/url'
import { isSameOriginBase } from '../io/circuitjsApi'
import { CIRCUITJS_BASE } from '../io/circuitjsConfig'
import { useCircuitJsLive } from './useCircuitJsLive'
import type { LiveCurrents } from './useCircuitJsLive'

interface SimulatorPanelProps {
  netlist: Netlist
  /** lint error があるか (ある間は実シミュレーションを呼ばない gating) */
  hasError: boolean
  /** ライブテレメトリ (blockId → 電流)。無効時は null */
  onCurrents: (currents: LiveCurrents | null) => void
}

/**
 * CircuitJS1 (Falstad) のライブビュー。
 * - 同一オリジン (既定の自前ホスト): iframe を一度だけロードし、netlist 変化は
 *   JS API の importCircuit で無再ロード反映。onupdate テレメトリで素子電流を
 *   親へ通知し、盤面の LED 発光と連動する。
 * - クロスオリジン (VITE_CIRCUITJS_BASE が外部): JS API に触れないため、
 *   従来どおり `?cct=` URL の再ロードで反映する (テレメトリなし)。
 */
export const SimulatorPanel = ({
  netlist,
  hasError,
  onCurrents,
}: SimulatorPanelProps): ReactElement => {
  const [open, setOpen] = useState(false)
  // 初回オープン時に固定する live iframe の URL (以後は importCircuit で反映)
  const [liveSrc, setLiveSrc] = useState<string | null>(null)
  const live = useMemo(() => isSameOriginBase(CIRCUITJS_BASE), [])
  const { iframeRef, handleLoad } = useCircuitJsLive({
    netlist,
    hasError,
    active: open && live,
    onCurrents,
  })

  const handleToggle = (): void => {
    if (!open && live && liveSrc === null) {
      // 初期ロードから正しい回路を出す (無効時は空のエンジンだけ立ち上げる)
      let src = circuitJsBaseUrl(CIRCUITJS_BASE)
      if (!hasError) {
        try {
          src = circuitJsUrl(netlist, CIRCUITJS_BASE)
        } catch {
          // 変換不能なら空エンジンで開始し、修正後に importCircuit で反映される
        }
      }
      setLiveSrc(src)
    }
    setOpen((o) => !o)
  }

  // クロスオリジン fallback 用: netlist ごとに URL を作り直す (再ロード反映)
  const fallbackUrl = useMemo(() => {
    if (live || hasError) return null
    try {
      return circuitJsUrl(netlist, CIRCUITJS_BASE)
    } catch {
      return null
    }
  }, [live, netlist, hasError])

  return (
    <section className="sim-panel">
      <div className="sim-head">
        <button
          type="button"
          className="toggle"
          aria-pressed={open}
          onClick={handleToggle}
        >
          シミュレーション表示
        </button>
        <span className="sim-note">
          CircuitJS1 で電流を可視化{live ? ' (ライブ接続)' : ''}
        </span>
      </div>
      {open &&
        (live ? (
          <>
            {hasError && (
              <p className="error">⚠ 回路を修正してから実行してください</p>
            )}
            {liveSrc && (
              <iframe
                ref={iframeRef}
                onLoad={handleLoad}
                className="sim-frame"
                title="CircuitJS1"
                src={liveSrc}
              />
            )}
          </>
        ) : hasError ? (
          <p className="error">⚠ 回路を修正してから実行してください</p>
        ) : fallbackUrl ? (
          <iframe className="sim-frame" title="CircuitJS1" src={fallbackUrl} />
        ) : (
          <p className="error">回路を変換できません</p>
        ))}
    </section>
  )
}
