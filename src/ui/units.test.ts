import { describe, expect, test } from 'vitest'
import { formatOhms } from './units'

describe('formatOhms', () => {
  test('1kΩ 未満は Ω で整数表示', () => {
    expect(formatOhms(100)).toBe('100 Ω')
    expect(formatOhms(470)).toBe('470 Ω')
  })

  test('1kΩ 以上は kΩ で小数 1 桁', () => {
    expect(formatOhms(1000)).toBe('1.0 kΩ')
    expect(formatOhms(4700)).toBe('4.7 kΩ')
    expect(formatOhms(100_000)).toBe('100.0 kΩ')
  })
})
