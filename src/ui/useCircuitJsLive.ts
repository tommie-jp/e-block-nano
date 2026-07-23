import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Netlist } from '../core/netlist/build'
import { serializeCircuitJs } from '../core/simulation/circuitjs/serialize'
import type { CircuitJsApi, CircuitJsWindow } from '../io/circuitjsApi'

/** blockId → 電流 [A]。BoardView の elementCurrents と同じ形 */
export type LiveCurrents = Readonly<Record<string, number>>

/** onupdate は約 60fps で来るので、React への反映はこの間隔に間引く */
const TELEMETRY_INTERVAL_MS = 100

interface UseCircuitJsLiveArgs {
  netlist: Netlist
  hasError: boolean
  /** パネルが開いていて live iframe が存在するか */
  active: boolean
  /** テレメトリ通知。無効時・エラー時は null が届く */
  onCurrents: (currents: LiveCurrents | null) => void
}

interface CircuitJsLive {
  iframeRef: RefObject<HTMLIFrameElement | null>
  /** iframe の onLoad に渡す (CircuitJS1 ロード完了を捕捉) */
  handleLoad: () => void
}

/**
 * 同一オリジン iframe の CircuitJS1 へ JS API でライブ接続する hook。
 * netlist 変化は importCircuit で無再ロード反映し、onupdate テレメトリで
 * 素子電流 (blockId キー) を親へ通知する。
 */
export const useCircuitJsLive = ({
  netlist,
  hasError,
  active,
  onCurrents,
}: UseCircuitJsLiveArgs): CircuitJsLive => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [sim, setSim] = useState<CircuitJsApi | null>(null)
  const blockIdsRef = useRef<readonly string[]>([])
  // onCurrents の同一性変化で effect が再走しないよう ref 経由にする
  const onCurrentsRef = useRef(onCurrents)
  onCurrentsRef.current = onCurrents

  const handleLoad = (): void => {
    const win = iframeRef.current?.contentWindow as CircuitJsWindow | null
    if (!win) return
    if (win.CircuitJS1) {
      setSim(win.CircuitJS1)
      return
    }
    win.oncircuitjsloaded = () => {
      if (win.CircuitJS1) setSim(win.CircuitJS1)
    }
  }

  // iframe が消えたら sim ハンドルも破棄する
  useEffect(() => {
    if (!active) {
      setSim(null)
      onCurrentsRef.current(null)
    }
  }, [active])

  // netlist 変化 → importCircuit で無再ロード反映 (lint error 中は停止)
  useEffect(() => {
    if (!sim || !active) return
    if (hasError) {
      sim.setSimRunning(false)
      onCurrentsRef.current(null)
      return
    }
    try {
      const { text, blockIds } = serializeCircuitJs(netlist)
      blockIdsRef.current = blockIds
      sim.importCircuit(text, false)
      sim.setSimRunning(true)
    } catch {
      // 変換不能 (GND なし等)。lint gating が先に立つはずだが境界で防御
      sim.setSimRunning(false)
      onCurrentsRef.current(null)
    }
  }, [sim, active, netlist, hasError])

  // テレメトリ: onupdate (約 60fps) を間引いて blockId → 電流に変換して通知
  useEffect(() => {
    if (!sim || !active) return
    let lastEmit = 0
    sim.onupdate = (s) => {
      const now = performance.now()
      if (now - lastEmit < TELEMETRY_INTERVAL_MS) return
      lastEmit = now
      const blockIds = blockIdsRef.current
      const elements = s.getElements()
      // 期待行数 = 素子 N + 接地 1。解析中や不整合のフレームは捨てる
      if (elements.length !== blockIds.length + 1) return
      const currents: Record<string, number> = {}
      blockIds.forEach((blockId, i) => {
        currents[blockId] = elements[i].getCurrent()
      })
      onCurrentsRef.current(currents)
    }
    return () => {
      sim.onupdate = null
    }
  }, [sim, active])

  return { iframeRef, handleLoad }
}
