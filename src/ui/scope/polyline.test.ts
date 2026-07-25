import { describe, expect, test } from 'vitest'
import { headPointAt, polylinePoints, revealedPoints, stackedMapper } from './polyline'

const identity = (v: number): number => v
const time = [0, 1, 2, 3, 4]
const values = [0, 10, 20, 30, 40]

describe('polylinePoints', () => {
  test('maps every sample through the x/y scales', () => {
    expect(polylinePoints(time, values, 0, identity, identity, 100)).toBe(
      '0,0 1,10 2,20 3,30 4,40',
    )
  })

  test('drops samples before the window start (left edge of the screen)', () => {
    expect(polylinePoints(time, values, 2, identity, identity, 100)).toBe(
      '2,20 3,30 4,40',
    )
  })

  test('thins out to at most maxPoints samples', () => {
    const many = Array.from({ length: 100 }, (_, i) => i)
    const pts = polylinePoints(many, many, 0, identity, identity, 10).split(' ')

    expect(pts.length).toBeLessThanOrEqual(10)
    expect(pts[0]).toBe('0,0')
  })

  test('an empty series draws nothing', () => {
    expect(polylinePoints([], [], 0, identity, identity, 10)).toBe('')
  })
})

describe('revealedPoints', () => {
  test('stops at the sweep head', () => {
    const pts = revealedPoints(time, values, 0, 2, identity, identity, 100)

    expect(pts.endsWith('2,20')).toBe(true)
  })
})

describe('headPointAt', () => {
  test('interpolates the trace value at the sweep head', () => {
    expect(headPointAt(time, values, 1.5, identity, identity)).toEqual({ x: 1.5, y: 15 })
  })

  test('clamps to the last sample past the end of the data', () => {
    expect(headPointAt(time, values, 99, identity, identity)).toEqual({ x: 99, y: 40 })
  })

  test('is null with no data (nothing to light up)', () => {
    expect(headPointAt([], [], 1, identity, identity)).toBeNull()
  })
})

describe('stackedMapper', () => {
  const lane = { cy: 100, half: 20 }

  test('centers the series on the lane baseline', () => {
    const y = stackedMapper(lane, [0, 10], 1)

    expect(y(5)).toBe(100) // 中点はレーン中心
    expect(y(10)).toBe(80) // 上端 = cy − half
    expect(y(0)).toBe(120)
  })

  test('gain stretches the amplitude around the baseline', () => {
    const y = stackedMapper(lane, [0, 10], 2)

    expect(y(10)).toBe(60)
  })

  test('a flat series does not divide by zero', () => {
    const y = stackedMapper(lane, [5, 5], 1)

    expect(Number.isFinite(y(5))).toBe(true)
  })
})
