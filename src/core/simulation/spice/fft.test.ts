import { describe, expect, test } from 'vitest'
import { fft, magnitudeSpectrum } from './fft'

describe('fft', () => {
  test('constant signal → all energy in the DC bin', () => {
    const re = [1, 1, 1, 1]
    const im = [0, 0, 0, 0]
    fft(re, im)
    expect(re[0]).toBeCloseTo(4, 10)
    expect(im[0]).toBeCloseTo(0, 10)
    for (let k = 1; k < 4; k++) {
      expect(Math.hypot(re[k], im[k])).toBeCloseTo(0, 10)
    }
  })

  test('unit impulse → flat spectrum of magnitude 1', () => {
    const re = [1, 0, 0, 0]
    const im = [0, 0, 0, 0]
    fft(re, im)
    for (let k = 0; k < 4; k++) {
      expect(Math.hypot(re[k], im[k])).toBeCloseTo(1, 10)
    }
  })
})

describe('magnitudeSpectrum', () => {
  test('a pure sine peaks at its frequency', () => {
    const f0 = 5 // Hz
    const span = 4 // s
    const time: number[] = []
    const values: number[] = []
    for (let i = 0; i <= 2000; i++) {
      const t = (i / 2000) * span
      time.push(t)
      values.push(Math.sin(2 * Math.PI * f0 * t))
    }
    const { freqs, mags } = magnitudeSpectrum(time, values)

    let peak = 0
    for (let k = 1; k < mags.length; k++) if (mags[k] > mags[peak]) peak = k
    expect(freqs[peak]).toBeCloseTo(f0, 0) // 分解能 (1/span=0.25Hz) 内で 5Hz
  })

  test('returns empty for degenerate input', () => {
    expect(magnitudeSpectrum([], [])).toEqual({ freqs: [], mags: [] })
    expect(magnitudeSpectrum([1], [1])).toEqual({ freqs: [], mags: [] })
  })
})
