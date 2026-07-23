import { describe, expect, test } from 'vitest'
import { buildNetlist } from '../../netlist/build'
import { deserializeBoard } from '../../persistence/boardFile'
import fixture from '../../../fixtures/circuits/battery-switch-resistor-led.json'
import { circuitJsUrl } from './url'

const netlist = () => buildNetlist(deserializeBoard(JSON.stringify(fixture)))

describe('circuitJsUrl', () => {
  test('builds a ?cct= url against the given base', () => {
    const url = circuitJsUrl(netlist(), '/circuitjs/circuitjs.html')

    expect(url.startsWith('/circuitjs/circuitjs.html?')).toBe(true)
    expect(url).toContain('running=true')
    expect(url).toContain('editable=false')
  })

  test('round-trips the circuit text through the cct query param', () => {
    const url = circuitJsUrl(netlist(), 'https://example.test/circuitjs.html')
    const query = new URL(url).searchParams

    const cct = query.get('cct')
    expect(cct).not.toBeNull()
    // 変換器の各素子行がそのまま復元できる
    expect(cct).toContain('r 16 32 48 64 0 1000')
    expect(cct).toMatch(/162 \d+ \d+ \d+ \d+ 0 1 0 0/) // LED (フラグ0・赤)
  })
})
