import { describe, expect, test } from 'vitest'
import { triggerTime } from './trigger'

describe('triggerTime', () => {
  const time = [0, 1, 2, 3, 4]
  const values = [0, 2, 0, 2, 0] // 三角状: up, down, up, down

  test('finds the first rising crossing with interpolation', () => {
    // 0→2 を level 1 で横切る: t = 0 + (1-0)/(2-0) = 0.5
    expect(triggerTime(time, values, 1, 'rising')).toBeCloseTo(0.5, 10)
  })

  test('finds the first falling crossing', () => {
    // 2→0 を level 1 で横切る: t = 1 + (1-2)/(0-2) = 1.5
    expect(triggerTime(time, values, 1, 'falling')).toBeCloseTo(1.5, 10)
  })

  test('returns null when the level is never crossed with that slope', () => {
    expect(triggerTime([0, 1], [0, 0.5], 1, 'rising')).toBeNull()
  })
})
