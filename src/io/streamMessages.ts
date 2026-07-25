import type { LiveSample, StreamConfig } from '../core/simulation/streamPort'

/** メイン → worker の制御メッセージ */
export type MainToWorker =
  | {
      readonly type: 'start'
      /** toSpice が出した SPICE 本文(.tran horizon まで含む) */
      readonly text: string
      /** nodeId → SPICE ノード名(SendData の電圧逆変換に使う) */
      readonly nodeNames: Readonly<Record<string, string>>
      /** blockId → 電流を読む SPICE 変数名(SendData の電流逆変換に使う) */
      readonly currentProbes: Readonly<Record<string, string>>
      readonly cfg: StreamConfig
    }
  | { readonly type: 'alter'; readonly cmd: string }
  | { readonly type: 'timebase'; readonly value: number }
  | { readonly type: 'stop' }

/** worker → メイン の通知 */
export type WorkerToMain =
  | { readonly type: 'samples'; readonly samples: readonly LiveSample[] }
  | { readonly type: 'status'; readonly simTime: number; readonly running: boolean }
  | { readonly type: 'error'; readonly message: string }
