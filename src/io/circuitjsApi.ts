/**
 * CircuitJS1 の JavaScript インターフェース型定義。
 * 出典: 自前ホスト版に同梱の doc/js-interface.html (実機で全メソッド確認済み)。
 * 同一オリジンの iframe でのみ利用できる (same-origin policy)。
 */

export interface CircuitJsElement {
  /** 素子のクラス名 (例: "LEDElm", "SwitchElm") */
  getType(): string
  getVoltageDiff(): number
  getVoltage(post: number): number
  getCurrent(): number
  getPostCount(): number
}

export interface CircuitJsApi {
  setSimRunning(run: boolean): void
  isRunning(): boolean
  getTime(): number
  getTimeStep(): number
  getMaxTimeStep(): number
  setMaxTimeStep(ts: number): void
  getNodeVoltage(name: string): number
  setExtVoltage(name: string, volts: number): void
  /** importCircuit した行順で返る (serializeCircuitJs の blockIds と整合) */
  getElements(): CircuitJsElement[]
  exportCircuit(): string
  importCircuit(circuit: string, subcircuitsOnly: boolean): void
  /** 描画更新ごと (約 60fps)。null で解除 */
  onupdate: ((sim: CircuitJsApi) => void) | null
  ontimestep: ((sim: CircuitJsApi) => void) | null
  onanalyze: ((sim: CircuitJsApi) => void) | null
}

/** iframe の contentWindow に生える CircuitJS1 グローバル */
export interface CircuitJsWindow extends Window {
  CircuitJS1?: CircuitJsApi
  oncircuitjsloaded?: () => void
}

/** ベース URL が同一オリジンなら JS API ライブ接続できる */
export const isSameOriginBase = (base: string): boolean => {
  try {
    return (
      new URL(base, window.location.href).origin === window.location.origin
    )
  } catch {
    return false
  }
}
