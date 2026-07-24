import { describe, expect, test } from 'vitest'
import { estimateFrequency, measureSeries, sampleAt } from './measure'

describe('sampleAt', () => {
  const time = [0, 1, 2]
  const values = [0, 10, 20]

  test('linearly interpolates within range', () => {
    expect(sampleAt(time, values, 0.5)).toBe(5)
    expect(sampleAt(time, values, 1.5)).toBe(15)
    expect(sampleAt(time, values, 1)).toBe(10)
  })

  test('clamps to end values outside range', () => {
    expect(sampleAt(time, values, -1)).toBe(0)
    expect(sampleAt(time, values, 3)).toBe(20)
  })

  test('empty series returns 0', () => {
    expect(sampleAt([], [], 1)).toBe(0)
  })
})

describe('estimateFrequency', () => {
  test('estimates from midpoint crossings', () => {
    // 0.5Hz 方形波 (周期 2s) を 4 秒 → 中点交差 4 回 → 0.5Hz
    const time: number[] = []
    const values: number[] = []
    for (let k = 0; k <= 400; k++) {
      const t = k * 0.01
      time.push(t)
      values.push(t % 2 < 1 ? 0 : 2)
    }
    expect(estimateFrequency(time, values)).toBeCloseTo(0.5, 5)
  })

  test('returns null for a constant series', () => {
    expect(estimateFrequency([0, 1, 2], [3, 3, 3])).toBeNull()
  })
})

describe('measureSeries', () => {
  test('constant series: vpp 0, no freq/period/duty', () => {
    const m = measureSeries([0, 1, 2], [3, 3, 3])
    expect(m).toMatchObject({ vmax: 3, vmin: 3, vpp: 0, vavg: 3, vrms: 3 })
    expect(m.freq).toBeNull()
    expect(m.period).toBeNull()
    expect(m.duty).toBeNull()
  })

  test('linear ramp: time-weighted vavg/vrms are exact integrals', () => {
    // v = t on [0,3]: ∫v dt /T = 1.5, √(∫v² dt /T) = √3
    const time = Array.from({ length: 301 }, (_, k) => k * 0.01)
    const values = time.map((t) => t)
    const m = measureSeries(time, values)
    expect(m.vavg).toBeCloseTo(1.5, 3)
    expect(m.vrms).toBeCloseTo(Math.sqrt(3), 3)
  })

  test('time-weighted average differs from sample mean on non-uniform steps', () => {
    // サンプル平均 = (0+0+10)/3 ≈ 3.33 だが、時間重みでは 4.5
    const m = measureSeries([0, 0.1, 1.0], [0, 0, 10])
    expect(m.vavg).toBeCloseTo(4.5, 6)
  })

  test('square wave: vpp, freq, period, duty', () => {
    const time: number[] = []
    const values: number[] = []
    for (let k = 0; k <= 400; k++) {
      const t = k * 0.01
      time.push(t)
      values.push(t % 2 < 1 ? 0 : 2)
    }
    const m = measureSeries(time, values)
    expect(m.vpp).toBe(2)
    expect(m.vavg).toBeCloseTo(1, 1)
    expect(m.vrms).toBeCloseTo(Math.SQRT2, 1)
    expect(m.freq).toBeCloseTo(0.5, 5)
    expect(m.period).toBeCloseTo(2, 5)
    expect(m.duty).toBeCloseTo(0.5, 1)
  })
})
