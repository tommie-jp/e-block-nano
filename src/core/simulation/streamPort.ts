import type { Netlist } from '../netlist/build'

/**
 * ストリーミング(ライブ連続オシロ)エンジンの差し替え境界。
 *
 * 既存の {@link SimulationPort}(`port.ts`) は 1 回きりの
 * `Promise<SimulationResult>`(バッチ/定量)。こちらは **連続ストリーム**:
 * libngspice(shared mode)の `SendData` が 1 タイムポイントごとに呼ばれ、
 * その各点を購読側(リングバッファ)へ流し込む。実装本体は Web Worker 側
 * (`io/scopeStreamWorker.ts`、Phase 2)。ここは純粋な型契約のみ。
 *
 * 連続性は「1 本の長い `.tran` を breakpoint(`stop when time > X`)で区切り、
 * `resume` で同じ状態から継続」する方式(Phase 0 spike で実証)。スレッドや
 * ASYNCIFY は使わない。
 */

/** 1 タイムポイントの生サンプル: 時刻 t[s]、nodeId→電圧[V]、blockId→電流[A] */
export interface LiveSample {
  readonly t: number
  /** nodeId → 電圧[V]。基準ノードは 0V を注入して含める */
  readonly values: Readonly<Record<string, number>>
  /** blockId → 電流[A]。電流プローブのある素子(電池・LED/ダイオード)のみ */
  readonly currents: Readonly<Record<string, number>>
}

/** ストリーム開始設定 */
export interface StreamConfig {
  /** `.tran` の刻み [s] */
  readonly step: number
  /** 1 本の `.tran` の上限時刻 [s](十分大きく取り、越えたら再アーム) */
  readonly horizon: number
  /** breakpoint 間隔(制御点)[s]。この粒度で pacing と live alter が効く */
  readonly intervalSec: number
}

/** 購読解除関数 */
export type Unsubscribe = () => void

/**
 * 実行中のストリームを制御するシーム。
 * - `start` で netlist を SPICE 化・ロードし、連続 `.tran` を開始
 * - `onSample` で 1 点ごとの {@link LiveSample} を購読
 * - `alter` で実行中に素子値を変更(次の制御点で反映)
 * - `setTimebase` で壁時計への追従速度を調整
 */
export interface ScopeStream {
  start(netlist: Netlist, cfg: StreamConfig): void
  onSample(cb: (sample: LiveSample) => void): Unsubscribe
  /** 実行中の素子値変更。blockId は Netlist の Element.blockId */
  alter(blockId: string, value: number): void
  /** 壁時計 secondsPerDiv(表示速度)。大きいほどゆっくり流れる */
  setTimebase(secPerDiv: number): void
  stop(): void
}
