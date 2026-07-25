import { describe, expect, test } from 'vitest'
import { intervalStats, readCursors } from './cursorReadout'
import type { DrawTrace } from './traceSeries'

const trace = (values: number[]): DrawTrace => ({
  expr: { kind: 'v', node: 'n1' },
  key: 'v:n1',
  label: 'N1',
  color: '#111',
  constant: false,
  values,
})

const time = [0, 1, 2, 3, 4]

describe('readCursors', () => {
  test('reads the attached trace at both cursor times', () => {
    const r = readCursors(time, trace([0, 10, 20, 30, 40]), 1, 3)

    expect(r).toMatchObject({ vA: 10, vB: 30, dt: 2, dv: 20 })
  })

  test('interpolates between samples (カーソルは点の間にも置ける)', () => {
    const r = readCursors(time, trace([0, 10, 20, 30, 40]), 1.5, 2)

    expect(r?.vA).toBeCloseTo(15)
  })

  test('reports 1/Δt as the frequency of the interval', () => {
    const r = readCursors(time, trace([0, 1, 2, 3, 4]), 1, 3)

    expect(r?.freq).toBeCloseTo(0.5)
  })

  test('reports the slope between the cursors', () => {
    const r = readCursors(time, trace([0, 10, 20, 30, 40]), 1, 3)

    expect(r?.slope).toBeCloseTo(10)
  })

  test('no frequency or slope when the cursors sit on the same time', () => {
    const r = readCursors(time, trace([0, 10, 20, 30, 40]), 2, 2)

    expect(r?.freq).toBeNull()
    expect(r?.slope).toBeNull()
  })

  test('is null without a trace to attach to', () => {
    expect(readCursors(time, null, 1, 2)).toBeNull()
  })
})

describe('intervalStats', () => {
  test('averages over the interval with time weighting (非等間隔の .tran)', () => {
    // 波形は点の間を直線で結ぶので台形積分: 0→10 の 1 秒で 5、10 のまま 2 秒で 20
    const stats = intervalStats([0, 1, 3], [0, 10, 10], 0, 3)

    expect(stats.avg).toBeCloseTo((5 * 1 + 10 * 2) / 3, 5)
  })

  test('RMS of a symmetric square is its amplitude', () => {
    const stats = intervalStats([0, 1, 1, 2], [1, 1, -1, -1], 0, 2)

    expect(stats.rms).toBeCloseTo(1, 5)
  })

  test('restricts to the given interval, not the whole record', () => {
    const stats = intervalStats([0, 1, 2, 3], [0, 0, 10, 10], 2, 3)

    expect(stats.avg).toBeCloseTo(10, 5)
  })

  test('a zero-length interval falls back to the sample there', () => {
    const stats = intervalStats([0, 1, 2], [0, 5, 10], 1, 1)

    expect(stats.avg).toBeCloseTo(5)
    expect(stats.rms).toBeCloseTo(5)
  })

  test('an empty series is zero, not NaN', () => {
    expect(intervalStats([], [], 0, 1)).toEqual({ avg: 0, rms: 0 })
  })
})
