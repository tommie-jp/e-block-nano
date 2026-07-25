import { describe, expect, test } from 'vitest'
import { makeScales } from './geometry'
import { fitsWindow, popZoom, pushZoom, rectToView } from './zoom'
import type { ZoomView } from './zoom'

const scales = makeScales({ start: 0, end: 10 }, { min: 0, max: 5 }, 240)

/** プロット領域の相対位置 (0..1) → SVG 座標 */
const at = (fx: number, fy: number) => ({
  x: scales.plot.left + fx * scales.plot.width,
  y: scales.plot.top + fy * scales.plot.height,
})

describe('rectToView', () => {
  test('turns a drag rectangle into the time window and Y range it covers', () => {
    // 左から 20%〜60%、上から 20%〜80% を囲む
    const view = rectToView(at(0.2, 0.2), at(0.6, 0.8), scales)

    expect(view?.win.start).toBeCloseTo(2)
    expect(view?.win.end).toBeCloseTo(6)
    // y は上が最大値なので、上 20% = 4V、下 80% = 1V
    expect(view?.yRange.max).toBeCloseTo(4)
    expect(view?.yRange.min).toBeCloseTo(1)
  })

  test('accepts a drag in any direction', () => {
    const a = rectToView(at(0.2, 0.2), at(0.6, 0.8), scales)
    const b = rectToView(at(0.6, 0.8), at(0.2, 0.2), scales)

    expect(b).toEqual(a)
  })

  test('ignores a rectangle too small to be a deliberate zoom (= a click)', () => {
    expect(rectToView(at(0.5, 0.5), at(0.503, 0.502), scales)).toBeNull()
  })

  test('clamps a drag that runs outside the plot area', () => {
    const view = rectToView({ x: -999, y: -999 }, at(0.5, 0.5), scales)

    expect(view?.win.start).toBeCloseTo(0)
    expect(view?.yRange.max).toBeCloseTo(5)
  })
})

describe('pushZoom / popZoom', () => {
  const v1: ZoomView = { win: { start: 1, end: 2 }, yRange: { min: 0, max: 1 } }
  const v2: ZoomView = { win: { start: 3, end: 4 }, yRange: { min: 2, max: 3 } }

  test('pushes views in order without mutating the stack', () => {
    const s1 = pushZoom([], v1)
    const s2 = pushZoom(s1, v2)

    expect(s2).toEqual([v1, v2])
    expect(s1).toEqual([v1])
  })

  test('popping returns the previous view and the shortened stack', () => {
    const stack = pushZoom(pushZoom([], v1), v2)

    const back = popZoom(stack)

    expect(back.view).toEqual(v1)
    expect(back.stack).toEqual([v1])
  })

  test('popping the last view returns to auto (null view, empty stack)', () => {
    const back = popZoom([v1])

    expect(back.view).toBeNull()
    expect(back.stack).toEqual([])
  })

  test('popping an empty stack stays empty', () => {
    expect(popZoom([])).toEqual({ view: null, stack: [] })
  })
})

describe('fitsWindow', () => {
  test('a window inside the data is usable', () => {
    expect(fitsWindow({ start: 1, end: 2 }, { start: 0, end: 10 })).toBe(true)
  })

  test('a window that misses the data entirely is not (回路を変えた後など)', () => {
    expect(fitsWindow({ start: 20, end: 30 }, { start: 0, end: 10 })).toBe(false)
  })

  test('a partial overlap still counts (末尾だけ残っているリングバッファ)', () => {
    expect(fitsWindow({ start: 8, end: 12 }, { start: 0, end: 10 })).toBe(true)
  })
})
