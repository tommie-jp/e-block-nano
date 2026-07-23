import type { Orientation } from '../grid/types'

/** 接点は辺中央 4 点。方位で識別する */
export type Direction = 'N' | 'E' | 'S' | 'W'

export type PartKind =
  | 'wire'
  | 'resistor'
  | 'capacitor'
  | 'led'
  | 'diode'
  | 'transistor-npn'
  | 'switch'
  | 'battery'

/** ブロック 1 種の定義。旧版の本質 =「部品 + ブロック内配線パターン」 */
export interface Part {
  readonly id: string
  readonly name: string
  readonly kind: PartKind
  /** ブロック内部で導通している端子のグループ (向き 0 のとき) */
  readonly internalNets: readonly (readonly Direction[])[]
  /** 将来 ngspice モデルに紐付ける参照 */
  readonly spiceModelRef?: string
}

const CLOCKWISE: readonly Direction[] = ['N', 'E', 'S', 'W']

/** ブロックの向きを適用した実方位を返す (90 = 時計回り 1 段) */
export const rotateDirection = (
  dir: Direction,
  orientation: Orientation,
): Direction => {
  const steps = orientation / 90
  const index = (CLOCKWISE.indexOf(dir) + steps) % 4
  return CLOCKWISE[index]
}
