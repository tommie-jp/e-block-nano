import { useEffect, useRef, useState } from 'react'

/**
 * 掃引位相 `phase ∈ [0,1)` を requestAnimationFrame で進めるフック。
 * 演算 (ngspice) とは無関係に、表示の掃引ヘッドを壁時計で動かすだけ。
 *
 * - `active=false` の間は 0 に戻して RAF を張らない。
 * - `periodSec` 秒で 1 周し、末尾まで行くと左端へ折り返す。
 * - 純ロジックは [sweep.ts](./sweep.ts) 側 (テスト付き)。ここは薄い駆動層。
 */
export const useSweep = (active: boolean, periodSec: number): number => {
  const [phase, setPhase] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      setPhase(0)
      return
    }
    const period = periodSec > 0 ? periodSec : 1
    const tick = (ts: number): void => {
      if (lastRef.current != null) {
        const dt = (ts - lastRef.current) / 1000
        setPhase((p) => (p + dt / period) % 1)
      }
      lastRef.current = ts
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      lastRef.current = null
    }
  }, [active, periodSec])

  return active ? phase : 0
}
