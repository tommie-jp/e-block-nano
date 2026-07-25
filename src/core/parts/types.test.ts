import { describe, expect, test } from 'vitest'
import { getPart, PARTS } from './catalog'
import { devicePins, rotateDirection, wiperOhms } from './types'
import type { Direction } from './types'

describe('rotateDirection', () => {
  test('returns the same direction at orientation 0', () => {
    expect(rotateDirection('N', 0)).toBe('N')
  })

  test('rotates clockwise by 90 degrees', () => {
    expect(rotateDirection('N', 90)).toBe('E')
    expect(rotateDirection('E', 90)).toBe('S')
    expect(rotateDirection('S', 90)).toBe('W')
    expect(rotateDirection('W', 90)).toBe('N')
  })

  test('rotates by 180 and 270 degrees', () => {
    expect(rotateDirection('N', 180)).toBe('S')
    expect(rotateDirection('N', 270)).toBe('W')
  })
})

describe('wiperOhms', () => {
  test('wiperPct を全抵抗に対する割合として掛ける', () => {
    expect(wiperOhms(100_000, 100)).toBe(100_000)
    expect(wiperOhms(100_000, 25)).toBe(25_000)
  })

  test('省略時は中央 (50%)', () => {
    expect(wiperOhms(100_000)).toBe(50_000)
  })

  test('0Ω (ショート) にならないよう下限でクリップする', () => {
    expect(wiperOhms(100_000, 0)).toBe(1_000) // 下限 1%
    expect(wiperOhms(100_000, -10)).toBe(1_000)
  })

  test('100% を超えても全抵抗で止まる', () => {
    expect(wiperOhms(100_000, 250)).toBe(100_000)
  })
})

describe('catalog', () => {
  const DIRECTIONS: readonly Direction[] = ['N', 'E', 'S', 'W']

  test('every part id is unique', () => {
    const ids = PARTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('getPart returns the part or throws for unknown id', () => {
    expect(getPart('wire-i').id).toBe('wire-i')
    expect(getPart('wire-i').device).toBeUndefined()
    expect(() => getPart('nope')).toThrow(/unknown part/)
  })

  test('a part is either a wire (internalNets) or a device, not empty', () => {
    for (const part of PARTS) {
      const hasWiring = part.internalNets.length > 0
      const hasDevice = part.device !== undefined
      expect(hasWiring || hasDevice).toBe(true)
      // 現行カタログはワイヤと素子を分離している
      expect(hasWiring && hasDevice).toBe(false)
    }
  })

  test('every device pin points at a distinct valid direction', () => {
    for (const part of PARTS) {
      if (!part.device) continue
      const dirs = devicePins(part.device).map(([, dir]) => dir)
      for (const dir of dirs) expect(DIRECTIONS).toContain(dir)
      // 2 つの役割が同じ辺を指すと素子の端子が潰れる
      expect(new Set(dirs).size).toBe(dirs.length)
    }
  })

  test('可変抵抗・信号源のパラメータも正の値', () => {
    for (const part of PARTS) {
      const d = part.device
      if (d?.kind === 'potentiometer') expect(d.maxOhms).toBeGreaterThan(0)
      if (d?.kind === 'ac-source' && d.wave.kind === 'sin') {
        expect(d.wave.hertz).toBeGreaterThan(0)
        expect(d.wave.amplitudeVolts).toBeGreaterThan(0)
      }
      if (d?.kind === 'ac-source' && d.wave.kind === 'pulse') {
        expect(d.wave.widthSeconds).toBeGreaterThan(0)
        expect(d.wave.periodSeconds).toBeGreaterThan(d.wave.widthSeconds)
      }
    }
  })

  test('numeric device parameters are positive', () => {
    for (const part of PARTS) {
      const d = part.device
      if (!d) continue
      if (d.kind === 'resistor') expect(d.ohms).toBeGreaterThan(0)
      if (d.kind === 'capacitor') expect(d.farads).toBeGreaterThan(0)
      if (d.kind === 'battery') expect(d.volts).toBeGreaterThan(0)
    }
  })
})
