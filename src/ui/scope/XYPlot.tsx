import type { ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { plotBox } from './geometry'
import { niceTicks } from './ticks'

const MAX_POINTS = 2000

const range = (values: readonly number[]): { lo: number; hi: number } => {
  let lo = 0
  let hi = 0
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo === hi ? { lo: lo - 1, hi: hi + 1 } : { lo, hi }
}

interface XYPlotProps {
  waveforms: Waveforms
  xId: string
  yId: string
  xLabel: string
  yLabel: string
}

/**
 * XY モード (リサージュ): 時間軸を捨て、あるノード電圧を X、別のノード電圧を Y に
 * 取ってプロットする。位相差・伝達特性の可視化に使う。
 */
export const XYPlot = ({
  waveforms,
  xId,
  yId,
  xLabel,
  yLabel,
}: XYPlotProps): ReactElement => {
  const box = plotBox()
  const xv = waveforms.nodeVoltages[xId] ?? []
  const yv = waveforms.nodeVoltages[yId] ?? []
  const xr = range(xv)
  const yr = range(yv)
  const sx = (v: number): number =>
    box.left + ((v - xr.lo) / (xr.hi - xr.lo)) * box.width
  const sy = (v: number): number =>
    box.bottom - ((v - yr.lo) / (yr.hi - yr.lo)) * box.height

  const n = Math.min(xv.length, yv.length)
  const stride = Math.max(1, Math.ceil(n / MAX_POINTS))
  const parts: string[] = []
  for (let i = 0; i < n; i += stride) parts.push(`${sx(xv[i])},${sy(yv[i])}`)

  const xTicks = niceTicks(xr.lo, xr.hi, 5)
  const yTicks = niceTicks(yr.lo, yr.hi, 5)

  return (
    <g className="xyplot">
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line
            x1={sx(v)}
            y1={box.top}
            x2={sx(v)}
            y2={box.bottom}
            className={v === 0 ? 'grat-line zero' : 'grat-line'}
          />
          <text x={sx(v)} y={box.bottom + 12} className="grat-label" textAnchor="middle">
            {v}
          </text>
        </g>
      ))}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line
            x1={box.left}
            y1={sy(v)}
            x2={box.right}
            y2={sy(v)}
            className={v === 0 ? 'grat-line zero' : 'grat-line'}
          />
          <text x={box.left - 6} y={sy(v) + 3} className="grat-label" textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <polyline className="xy-line" points={parts.join(' ')} />
      <text x={box.right} y={box.bottom + 12} className="grat-unit" textAnchor="end">
        X: {xLabel} [V]
      </text>
      <text x={box.left - 6} y={box.top - 2} className="grat-unit" textAnchor="end">
        Y: {yLabel} [V]
      </text>
    </g>
  )
}
