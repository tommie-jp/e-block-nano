import { describe, expect, test } from 'vitest'
import { CELL_SIZE } from '../render/constants'
import type { Waveforms } from '../core/simulation/spice/mapResult'
import {
  dominantOscillation,
  probePoint,
  selectProbes,
  SERIES_COLORS,
  viewWindow,
} from './waveProbes'

describe('selectProbes', () => {
  test('drops all-zero nodes and assigns stable colors + labels', () => {
    const waveforms: Waveforms = {
      time: [0, 1, 2],
      nodeVoltages: {
        'H:1,0': [0, 0, 0], // 基準/未接続 → 除外
        'H:0,0': [3, 2, 3],
        'V:0,1': [0, 1, 0],
      },
    }

    const probes = selectProbes(waveforms)

    expect(probes).toEqual([
      { nodeId: 'H:0,0', color: SERIES_COLORS[0], label: 'N1', constant: false },
      { nodeId: 'V:0,1', color: SERIES_COLORS[1], label: 'N2', constant: false },
    ])
  })

  test('flags near-constant nodes (rail) as constant', () => {
    const waveforms: Waveforms = {
      time: [0, 1, 2, 3],
      nodeVoltages: {
        'H:0,0': [3, 3, 3.01, 3], // レール: p2p ≈ 0 → constant
        'V:0,1': [0, 3, 0, 3], // 発振: p2p = 3 → 非 constant
      },
    }

    const probes = selectProbes(waveforms)

    expect(probes.find((p) => p.nodeId === 'H:0,0')?.constant).toBe(true)
    expect(probes.find((p) => p.nodeId === 'V:0,1')?.constant).toBe(false)
  })

  test('wraps colors when more nodes than the palette', () => {
    const nodeVoltages: Record<string, number[]> = {}
    for (let i = 0; i < SERIES_COLORS.length + 1; i++) {
      nodeVoltages[`H:${i},0`] = [1]
    }
    const probes = selectProbes({ time: [0], nodeVoltages })

    expect(probes).toHaveLength(SERIES_COLORS.length + 1)
    expect(probes.at(-1)?.color).toBe(SERIES_COLORS[0]) // wrap-around
  })
})

describe('dominantOscillation', () => {
  test('picks the largest-amplitude non-constant node and estimates freq', () => {
    // 0.5Hz 方形波 (周期 2s) を 4 秒: 中点交差 4 回 → freq = 4/2/4 = 0.5Hz
    const time = Array.from({ length: 9 }, (_, i) => i * 0.5)
    const square = time.map((t) => (Math.floor(t) % 2 === 0 ? 0 : 3))
    const waveforms: Waveforms = {
      time,
      nodeVoltages: { 'H:0,0': time.map(() => 3), 'V:0,1': square },
    }
    const probes = selectProbes(waveforms)

    const osc = dominantOscillation(waveforms, probes)

    expect(osc?.nodeId).toBe('V:0,1')
    expect(osc?.freq).toBeCloseTo(0.5, 5)
  })

  test('returns null when nothing oscillates', () => {
    const waveforms: Waveforms = {
      time: [0, 1, 2],
      nodeVoltages: { 'H:0,0': [3, 3, 3] },
    }
    expect(dominantOscillation(waveforms, selectProbes(waveforms))).toBeNull()
  })
})

describe('viewWindow', () => {
  test('crops to the last few periods when oscillating', () => {
    const time = Array.from({ length: 21 }, (_, i) => i) // 0..20s
    const square = time.map((t) => (t % 2 === 0 ? 0 : 3)) // ~0.5Hz → 周期 2s
    const waveforms: Waveforms = { time, nodeVoltages: { 'V:0,1': square } }

    const win = viewWindow(waveforms, selectProbes(waveforms))

    expect(win.end).toBe(20)
    expect(win.start).toBeGreaterThan(0) // 全 20s より狭い
    expect(win.end - win.start).toBeLessThan(20)
  })

  test('shows the full span when there is no oscillation', () => {
    const waveforms: Waveforms = {
      time: [0, 1, 2, 3],
      nodeVoltages: { 'H:0,0': [0, 1, 2, 3] }, // 単調増加 (RC 充電) → クロップされず全区間
    }
    expect(viewWindow(waveforms, selectProbes(waveforms))).toEqual({
      start: 0,
      end: 3,
    })
  })
})

describe('probePoint', () => {
  test('maps H/V edge keys to edge-midpoint coordinates', () => {
    // H:row,col = セル col の上辺の中点
    expect(probePoint('H:2,3')).toEqual({
      x: 3 * CELL_SIZE + CELL_SIZE / 2,
      y: 2 * CELL_SIZE,
    })
    // V:row,col = セル row の左辺の中点
    expect(probePoint('V:2,3')).toEqual({
      x: 3 * CELL_SIZE,
      y: 2 * CELL_SIZE + CELL_SIZE / 2,
    })
  })

  test('returns null for unparseable node ids', () => {
    expect(probePoint('nonsense')).toBeNull()
  })
})
