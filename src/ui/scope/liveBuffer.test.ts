import { describe, expect, test } from 'vitest'
import type { LiveSample } from '../../core/simulation/streamPort'
import { createLiveBuffer } from './liveBuffer'

/** t 秒・ノード a/b・基準 gnd(常に0) の 1 点を作る */
const sample = (t: number, a: number, b: number): LiveSample => ({
  t,
  values: { gnd: 0, a, b },
})

describe('createLiveBuffer', () => {
  test('push した順に昇順 Waveforms で返す', () => {
    const buf = createLiveBuffer(10)
    buf.push(sample(0, 1, 5))
    buf.push(sample(1, 2, 6))
    buf.push(sample(2, 3, 7))
    const w = buf.toWindow()
    expect(w.time).toEqual([0, 1, 2])
    expect(w.nodeVoltages.a).toEqual([1, 2, 3])
    expect(w.nodeVoltages.b).toEqual([5, 6, 7])
    expect(w.nodeVoltages.gnd).toEqual([0, 0, 0])
  })

  test('容量を超えると古いサンプルから落ちる (bounded memory)', () => {
    const buf = createLiveBuffer(3)
    for (let i = 0; i < 5; i++) buf.push(sample(i, i, 0))
    const w = buf.toWindow()
    // 直近 3 点 (t=2,3,4) だけ残る
    expect(w.time).toEqual([2, 3, 4])
    expect(w.nodeVoltages.a).toEqual([2, 3, 4])
    expect(buf.size()).toBe(3)
  })

  test('spanSec で直近の窓だけを返す', () => {
    const buf = createLiveBuffer(100)
    for (let i = 0; i <= 10; i++) buf.push(sample(i, i, 0))
    // latest=10, span=3 → t>=7
    const w = buf.toWindow(3)
    expect(w.time).toEqual([7, 8, 9, 10])
  })

  test('空バッファは time 空・nodeVoltages 空', () => {
    const buf = createLiveBuffer(10)
    const w = buf.toWindow()
    expect(w.time).toEqual([])
    expect(Object.keys(w.nodeVoltages)).toEqual([])
    expect(buf.latestTime()).toBeNull()
  })

  test('latestTime は最新サンプルの時刻', () => {
    const buf = createLiveBuffer(10)
    buf.push(sample(0.5, 0, 0))
    buf.push(sample(1.25, 0, 0))
    expect(buf.latestTime()).toBeCloseTo(1.25, 12)
  })

  test('clear で空に戻る', () => {
    const buf = createLiveBuffer(10)
    buf.push(sample(0, 1, 2))
    buf.clear()
    expect(buf.size()).toBe(0)
    expect(buf.toWindow().time).toEqual([])
  })

  test('toWindow は既存の測定ロジックが食える形 (time 昇順・同長系列)', () => {
    const buf = createLiveBuffer(10)
    buf.push(sample(0, 0, 0))
    buf.push(sample(1, 10, 0))
    const w = buf.toWindow()
    expect(w.time.length).toBe(w.nodeVoltages.a.length)
    for (let i = 1; i < w.time.length; i++) {
      expect(w.time[i]).toBeGreaterThan(w.time[i - 1])
    }
  })
})
