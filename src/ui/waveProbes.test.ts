import { describe, expect, test } from 'vitest'
import { CELL_SIZE } from '../render/constants'
import type { Waveforms } from '../core/simulation/spice/mapResult'
import { probePoint, selectProbes, SERIES_COLORS } from './waveProbes'

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
      { nodeId: 'H:0,0', color: SERIES_COLORS[0], label: 'N1' },
      { nodeId: 'V:0,1', color: SERIES_COLORS[1], label: 'N2' },
    ])
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
