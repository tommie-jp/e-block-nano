import { describe, expect, test } from 'vitest'
import { revealedSamples, sampleAt, sweepHeadTime } from './sweep'

describe('sweepHeadTime', () => {
  const win = { start: 1, end: 5 }

  test('phase 0 は窓の左端、phase 1 は右端', () => {
    expect(sweepHeadTime(win, 0)).toBe(1)
    expect(sweepHeadTime(win, 1)).toBe(5)
  })

  test('中間位相は窓内を線形に進む', () => {
    expect(sweepHeadTime(win, 0.25)).toBe(2)
    expect(sweepHeadTime(win, 0.5)).toBe(3)
  })

  test('範囲外の位相はクランプする', () => {
    expect(sweepHeadTime(win, -1)).toBe(1)
    expect(sweepHeadTime(win, 2)).toBe(5)
  })
})

describe('sampleAt', () => {
  const time = [0, 1, 2, 3]
  const values = [0, 10, 20, 30]

  test('サンプル点上ではその値', () => {
    expect(sampleAt(time, values, 2)).toBe(20)
  })

  test('区間内は線形補間', () => {
    expect(sampleAt(time, values, 1.5)).toBe(15)
  })

  test('非等間隔でも正しく補間する', () => {
    const t = [0, 0.1, 5]
    const v = [0, 100, 200]
    // 0.1〜5 の区間: 2.55 は (2.55-0.1)/(5-0.1)=0.5 → 150
    expect(sampleAt(t, v, 2.55)).toBeCloseTo(150, 6)
  })

  test('範囲外は端の値でクランプ', () => {
    expect(sampleAt(time, values, -5)).toBe(0)
    expect(sampleAt(time, values, 99)).toBe(30)
  })

  test('空配列は null', () => {
    expect(sampleAt([], [], 0)).toBeNull()
  })
})

describe('revealedSamples', () => {
  const time = [0, 1, 2, 3, 4]
  const values = [0, 1, 2, 3, 4]

  test('ヘッドまでの実サンプル＋ヘッド補間点で締める', () => {
    const out = revealedSamples(time, values, 0, 2.5, 100)
    expect(out[0]).toEqual([0, 0])
    // t<=2.5 の実点 (0,1,2) の後にヘッド補間点 [2.5, 2.5]
    expect(out.at(-1)).toEqual([2.5, 2.5])
  })

  test('ヘッドが左端手前なら空 (まだ何も現れていない)', () => {
    expect(revealedSamples(time, values, 1, 0.5, 100)).toEqual([])
  })

  test('窓開始より前の点は含めない', () => {
    const out = revealedSamples(time, values, 2, 4, 100)
    expect(out.every(([t]) => t >= 2)).toBe(true)
  })

  test('maxPoints で間引いても先端はヘッド時刻で終わる', () => {
    const dense = Array.from({ length: 1000 }, (_, i) => i / 100)
    const out = revealedSamples(dense, dense, 0, 5, 50)
    expect(out.length).toBeLessThanOrEqual(51)
    expect(out.at(-1)?.[0]).toBeCloseTo(5, 6)
  })

  test('空データは空配列', () => {
    expect(revealedSamples([], [], 0, 1, 100)).toEqual([])
  })
})
