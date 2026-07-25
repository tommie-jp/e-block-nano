import { describe, expect, test } from 'vitest'
import { audioSpeedup, resampleToAudio } from './audio'

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

describe('audioSpeedup', () => {
  test('可聴域より遅い発振は 100 倍速にする (発振周波数がそのまま音程になる)', () => {
    // 04 の 1.4Hz → 140Hz、電子オルガンの 1.1〜3.3Hz → 110〜330Hz
    expect(audioSpeedup(1.4)).toBe(100)
    expect(audioSpeedup(3.3)).toBe(100)
  })

  test('遅い発振どうしは同じ倍率 → 音程比 = 周波数比 (つまみで音が変わる)', () => {
    const slow = 1.1
    const fast = 3.3
    expect(audioSpeedup(slow)).toBe(audioSpeedup(fast))
    // 鳴る高さ = 周波数 × 倍率。倍率が同じなので比は周波数比のまま
    expect((fast * audioSpeedup(fast)) / (slow * audioSpeedup(slow))).toBeCloseTo(3, 6)
  })

  test('すでに可聴域なら等倍で鳴らす', () => {
    expect(audioSpeedup(200)).toBe(1)
    expect(audioSpeedup(1000)).toBe(1)
  })

  test('発振が無い (0Hz) ときは等倍 (呼び出し側が発振検出で弾く)', () => {
    expect(audioSpeedup(0)).toBe(1)
  })
})
