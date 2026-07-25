import { describe, expect, test } from 'vitest'
import { minorTicks, niceTicks } from './ticks'

describe('niceTicks', () => {
  test('unit steps over 0..3', () => {
    expect(niceTicks(0, 3, 3)).toEqual([0, 1, 2, 3])
  })

  test('0.5 steps over a cropped window 2.65..5', () => {
    expect(niceTicks(2.65, 5, 4)).toEqual([3, 3.5, 4, 4.5, 5])
  })

  test('handles a bipolar range with 0 included', () => {
    const ticks = niceTicks(-3, 3, 3)
    expect(ticks).toContain(0)
    // 等間隔で min..max の内側に収まる
    for (const t of ticks) expect(t).toBeGreaterThanOrEqual(-3)
    for (const t of ticks) expect(t).toBeLessThanOrEqual(3)
  })

  test('is order-insensitive for min/max', () => {
    expect(niceTicks(5, 2.65, 4)).toEqual(niceTicks(2.65, 5, 4))
  })

  test('degenerate ranges return empty', () => {
    expect(niceTicks(1, 1)).toEqual([])
    expect(niceTicks(Number.NaN, 3)).toEqual([])
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([])
  })

  test('avoids floating-point noise in tick values', () => {
    // 0.1 刻みで 0.30000000000000004 のような値が出ないこと
    const ticks = niceTicks(0, 0.5, 5)
    for (const t of ticks) {
      expect(Number(t.toFixed(10))).toBe(t)
    }
  })
})

describe('minorTicks', () => {
  test('主目盛りの間を等分し、主目盛り位置は含めない', () => {
    // 0..3, major=1, sub=5 → minor 0.2 刻み、1/2/3 は除外
    const minor = minorTicks(0, 3, 3, 5)
    expect(minor).toContain(0.2)
    expect(minor).toContain(0.8)
    expect(minor).not.toContain(1) // 主目盛りは含めない
    expect(minor).not.toContain(2)
    expect(minor).not.toContain(0)
  })

  test('副目盛りは主目盛りより細かい (本数が多い)', () => {
    expect(minorTicks(0, 3, 3, 5).length).toBeGreaterThan(niceTicks(0, 3, 3).length)
  })

  test('浮動小数ノイズを出さない', () => {
    for (const t of minorTicks(0, 0.5, 5, 5)) {
      expect(Number(t.toFixed(10))).toBe(t)
    }
  })

  test('退化ケースは空', () => {
    expect(minorTicks(1, 1)).toEqual([])
    expect(minorTicks(Number.NaN, 3)).toEqual([])
  })
})
