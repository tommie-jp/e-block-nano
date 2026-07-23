import { describe, expect, test } from 'vitest'
import { getPart, PARTS } from './catalog'
import { rotateDirection } from './types'

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

describe('catalog', () => {
  test('every part id is unique', () => {
    const ids = PARTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('getPart returns the part or throws for unknown id', () => {
    expect(getPart('wire-i').kind).toBe('wire')
    expect(() => getPart('nope')).toThrow(/unknown part/)
  })
})
