import { describe, expect, test } from 'vitest'
import { formatWithPrefix, pickPrefix } from './siPrefix'

describe('pickPrefix', () => {
  test('picks the prefix that puts the number in 1..999', () => {
    expect(pickPrefix(1.5e-6, 'A')).toEqual({ scale: 1e6, label: 'µA' })
    expect(pickPrefix(1.1e-3, 'A')).toEqual({ scale: 1e3, label: 'mA' })
    expect(pickPrefix(5, 'A')).toEqual({ scale: 1, label: 'A' })
    expect(pickPrefix(5000, 'Hz')).toEqual({ scale: 1e-3, label: 'kHz' })
    expect(pickPrefix(2e6, 'Hz')).toEqual({ scale: 1e-6, label: 'MHz' })
  })

  test('switches exactly at the decade boundary', () => {
    expect(pickPrefix(0.999e-3, 'A').label).toBe('µA')
    expect(pickPrefix(1e-3, 'A').label).toBe('mA')
    expect(pickPrefix(999, 'V').label).toBe('V')
    expect(pickPrefix(1000, 'V').label).toBe('kV')
  })

  test('clamps outside the n..M range instead of inventing prefixes', () => {
    expect(pickPrefix(1e-12, 'A').label).toBe('nA')
    expect(pickPrefix(1e12, 'V').label).toBe('MV')
  })

  test('zero and non-finite magnitudes keep the plain unit', () => {
    expect(pickPrefix(0, 'V')).toEqual({ scale: 1, label: 'V' })
    expect(pickPrefix(Number.NaN, 'V')).toEqual({ scale: 1, label: 'V' })
    expect(pickPrefix(Infinity, 'V')).toEqual({ scale: 1, label: 'V' })
  })

  test('uses the magnitude, not the sign', () => {
    expect(pickPrefix(-1.5e-6, 'A').label).toBe('µA')
  })

  test('a dimensionless quantity gets no prefix (比や微分)', () => {
    expect(pickPrefix(1.5e-6, '')).toEqual({ scale: 1, label: '' })
  })
})

describe('formatWithPrefix', () => {
  test('formats a value with its unit', () => {
    expect(formatWithPrefix(0.0011, 'A')).toBe('1.10 mA')
    expect(formatWithPrefix(3, 'V')).toBe('3.00 V')
    expect(formatWithPrefix(1.5e-6, 'A')).toBe('1.50 µA')
  })

  test('keeps 3 significant digits as the number grows', () => {
    expect(formatWithPrefix(12.34, 'V')).toBe('12.3 V')
    expect(formatWithPrefix(123.4, 'V')).toBe('123 V')
  })

  test('falls back to exponent notation beyond the prefix range', () => {
    expect(formatWithPrefix(1e-12, 'A')).toContain('e-')
  })

  test('zero is plain', () => {
    expect(formatWithPrefix(0, 'V')).toBe('0.00 V')
  })

  test('a reference magnitude decides the prefix (Δ=0 next to a mA trace)', () => {
    expect(formatWithPrefix(0, 'A', 0.0011)).toBe('0.00 mA')
    expect(formatWithPrefix(0.00002, 'A', 0.0011)).toBe('0.02 mA')
  })

  test('a dimensionless value has no unit suffix', () => {
    expect(formatWithPrefix(0.5, '')).toBe('0.500')
  })
})
