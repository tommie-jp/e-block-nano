import { formatWithPrefix } from '../../core/scope/siPrefix'
import { UNIT_SYMBOL } from './traceSeries'
import type { Unit } from '../../core/scope/traceExpr'

/**
 * オシロの読み取り値の書式。桁は SI 接頭辞で自動的に選ぶ
 * (`core/scope/siPrefix`)。軸の目盛りと同じ表を引くので表記がずれない。
 */

/**
 * 単位つきの値 (トレースの単位から記号を決める)。
 * `reference` はその値が属する系列の代表的な大きさ (差分が 0 のときの桁合わせ用)。
 */
export const formatValue = (value: number, unit: Unit, reference?: number): string =>
  formatWithPrefix(value, UNIT_SYMBOL[unit], reference)

export const fmtT = (t: number): string => formatWithPrefix(t, 's')
export const fmtHz = (f: number): string => formatWithPrefix(f, 'Hz')
export const fmtV = (v: number): string => formatWithPrefix(v, 'V')
export const fmtI = (a: number): string => formatWithPrefix(a, 'A')
export const fmtW = (w: number): string => formatWithPrefix(w, 'W')
