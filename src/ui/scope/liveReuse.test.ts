import { describe, expect, test } from 'vitest'
import { measureSeries } from '../../core/simulation/spice/measure'
import type { LiveSample } from '../../core/simulation/streamPort'
import { createLiveBuffer } from './liveBuffer'
import { triggerTime } from './trigger'

/**
 * ライブ窓 (liveBuffer.toWindow) を既存の純ロジックがそのまま食えることの担保。
 * ストリーミングエンジンを繋ぐ前に、表示・測定の再利用が壊れていないか固定する。
 */
describe('liveBuffer の窓を既存ロジックで測る', () => {
  const FREQ = 5 // Hz
  const buf = createLiveBuffer(4096)
  // 1 秒ぶんの 5Hz サイン波を 1ms 刻みで流し込む
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000
    const v = Math.sin(2 * Math.PI * FREQ * t)
    const s: LiveSample = { t, values: { gnd: 0, a: v }, currents: {} }
    buf.push(s)
  }
  const w = buf.toWindow()

  test('measureSeries が Vpp と周波数を正しく出す', () => {
    const m = measureSeries(w.time, w.nodeVoltages.a)
    expect(m.vpp).toBeCloseTo(2, 2)
    expect(m.freq).not.toBeNull()
    // 中点交差ベースの推定は端点で ±1 交差ぶれる (5Hz→実測4.5)。妥当な範囲で確認
    expect(m.freq as number).toBeGreaterThan(4)
    expect(m.freq as number).toBeLessThan(6)
  })

  test('triggerTime が最初の立ち上がり交差を返す', () => {
    // sin が 0.5 を最初に上向きに横切るのは 2π·5·t = π/6 → t = 1/60 s
    const t = triggerTime(w.time, w.nodeVoltages.a, 0.5, 'rising')
    expect(t).not.toBeNull()
    expect(t as number).toBeCloseTo(1 / 60, 2)
  })
})
