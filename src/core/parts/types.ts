import type { Orientation } from '../grid/types'

/** 接点は辺中央 4 点。方位で識別する */
export type Direction = 'N' | 'E' | 'S' | 'W'

/**
 * エンジン非依存の素子仕様 (discriminated union)。
 * ピンは「役割名 → 向き 0 基準の方位」。SPICE 変換器はこの構造化データだけを
 * 見れば書ける (自由文字列を持たない)。エンジンを足す場合も同じ前提でよい。
 */
export type DeviceSpec =
  | { readonly kind: 'resistor'; readonly ohms: number; readonly pins: TwoPins }
  | { readonly kind: 'capacitor'; readonly farads: number; readonly pins: TwoPins }
  | {
      readonly kind: 'led'
      readonly model: string
      readonly pins: PolarPins
    }
  | {
      readonly kind: 'diode'
      readonly model: string
      readonly pins: PolarPins
    }
  | { readonly kind: 'switch'; readonly pins: TwoPins }
  | {
      readonly kind: 'battery'
      readonly volts: number
      readonly pins: { readonly plus: Direction; readonly minus: Direction }
    }
  | {
      readonly kind: 'transistor-npn'
      readonly model: string
      readonly pins: {
        readonly base: Direction
        readonly collector: Direction
        readonly emitter: Direction
      }
    }

/** 無極性 2 端子 */
export interface TwoPins {
  readonly a: Direction
  readonly b: Direction
}

/** 極性つき 2 端子 (LED・ダイオード) */
export interface PolarPins {
  readonly anode: Direction
  readonly cathode: Direction
}

export type DeviceKind = DeviceSpec['kind']

/**
 * ブロック 1 種の定義。旧版の本質 =「部品 + ブロック内配線パターン」。
 * - `internalNets`: ブロック内部で単に導通しているだけの端子グループ (ワイヤ)
 * - `device`: 端子間に挟まる素子。ピンは別ノードになる (導通させない)
 * ワイヤブロックは device を持たず、素子ブロックは internalNets が空。
 * 将来「素子 + 内部配線」の複合ブロックは両方を持てる。
 */
export interface Part {
  readonly id: string
  readonly name: string
  /** ブロック内部で導通している端子のグループ (向き 0 のとき) */
  readonly internalNets: readonly (readonly Direction[])[]
  /** 素子仕様。ワイヤブロックは undefined */
  readonly device?: DeviceSpec
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

/** 素子ピンの (役割名, 向き 0 基準の方位) 一覧 */
export const devicePins = (
  device: DeviceSpec,
): readonly (readonly [role: string, dir: Direction])[] =>
  Object.entries(device.pins) as (readonly [string, Direction])[]
