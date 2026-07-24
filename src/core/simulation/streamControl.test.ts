import { describe, expect, test } from 'vitest'
import {
  alterCommand,
  nextBreakpoint,
  needsRearm,
  pacingDelayMs,
} from './streamControl'

describe('nextBreakpoint', () => {
  test('interval 格子の次の停止時刻へ切り上げる', () => {
    expect(nextBreakpoint(0, 0.1)).toBeCloseTo(0.1, 9)
    expect(nextBreakpoint(0.05, 0.1)).toBeCloseTo(0.1, 9)
    expect(nextBreakpoint(0.23, 0.1)).toBeCloseTo(0.3, 9)
  })

  test('ちょうど格子上なら次の格子へ進む (同じ点で止まり続けない)', () => {
    expect(nextBreakpoint(0.1, 0.1)).toBeCloseTo(0.2, 9)
    expect(nextBreakpoint(0.2, 0.1)).toBeCloseTo(0.3, 9)
  })

  test('interval<=0 は現在時刻を返す (無限ループ防止)', () => {
    expect(nextBreakpoint(0.5, 0)).toBe(0.5)
  })
})

describe('pacingDelayMs', () => {
  test('壁時計がシム時刻に追いつくまでの待ち [ms]', () => {
    // simTime=0.5s, timebase=1 → 目標 500ms。経過 200ms なら 300ms 待つ
    expect(pacingDelayMs(0.5, 200, 1)).toBeCloseTo(300, 6)
  })

  test('既に遅れているなら 0 (待たない)', () => {
    expect(pacingDelayMs(0.5, 900, 1)).toBe(0)
  })

  test('timebase で表示速度が変わる (2 倍ゆっくり)', () => {
    // simTime=0.5s, timebase=2 → 目標 1000ms
    expect(pacingDelayMs(0.5, 200, 2)).toBeCloseTo(800, 6)
  })
})

describe('alterCommand', () => {
  const refs = { blk1: 'r1', blk2: 'c1' }

  test('blockId から SPICE alter コマンドを作る', () => {
    expect(alterCommand(refs, 'blk1', 2000)).toBe('alter r1 = 2000')
  })

  test('対応デバイスの無い blockId は null (無視)', () => {
    expect(alterCommand(refs, 'unknown', 5)).toBeNull()
  })
})

describe('needsRearm', () => {
  test('次の停止が horizon 以上なら再アームが要る', () => {
    expect(needsRearm(1000, 1000)).toBe(true)
    expect(needsRearm(1000.1, 1000)).toBe(true)
    expect(needsRearm(999.9, 1000)).toBe(false)
  })
})
