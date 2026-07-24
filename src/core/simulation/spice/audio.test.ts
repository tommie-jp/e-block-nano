import { describe, expect, test } from 'vitest'
import { resampleToAudio } from './audio'

describe('resampleToAudio', () => {
  test('normalizes a 0..3V square-ish wave to about [-1,1]', () => {
    const time = [0, 0.1, 0.2, 0.3, 0.4]
    const values = [0, 3, 0, 3, 0] // 0V↔3V
    const pcm = resampleToAudio(time, values, 100)

    expect(pcm.length).toBe(Math.floor(100 * 0.4))
    let min = Infinity
    let max = -Infinity
    for (const v of pcm) {
      if (v < min) min = v
      if (v > max) max = v
    }
    // 中点 1.5V を 0 に、±1.5V を ±1 に
    expect(max).toBeCloseTo(1, 1)
    expect(min).toBeCloseTo(-1, 1)
  })

  test('returns empty for too-short input', () => {
    expect(resampleToAudio([0], [1], 44100).length).toBe(0)
  })

  test('length follows the simulated time span and sample rate', () => {
    const pcm = resampleToAudio([0, 1, 2], [0, 1, 0], 1000)
    expect(pcm.length).toBe(2000) // 2 秒 × 1000Hz
  })
})
