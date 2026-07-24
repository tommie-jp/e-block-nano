import type { ReactElement } from 'react'
import type { Scales } from './geometry'
import { niceTicks } from './ticks'

/** X 軸 (時間) 目盛りの目安本数。cropped 窓でも綺麗な刻みになるよう多め */
const X_TICKS = 6
const Y_TICKS = 5

/** 時間ラベルの桁数: 窓幅が狭い (発振クロップ時) ほど細かく */
const timeLabel = (t: number, span: number): string =>
  `${t.toFixed(span < 1 ? 3 : span < 10 ? 2 : 1)}`

/**
 * オシロのグレーティクル: X (時間) / Y (電圧) の格子線と目盛りラベル。
 * 0V 基準線は強調して描く。段組み表示では Y (電圧) 軸が意味を持たないので
 * showY=false で X (時間) のみ描く。
 */
export const Graticule = ({
  scales,
  showY = true,
}: {
  scales: Scales
  showY?: boolean
}): ReactElement => {
  const { plot, win, yRange } = scales
  const xTicks = niceTicks(win.start, win.end, X_TICKS)
  const yTicks = showY ? niceTicks(yRange.min, yRange.max, Y_TICKS) : []
  const span = win.end - win.start

  return (
    <g className="graticule">
      {/* 縦線 (時間) + 下端ラベル */}
      {xTicks.map((t) => {
        const px = scales.x(t)
        return (
          <g key={`x${t}`}>
            <line x1={px} y1={plot.top} x2={px} y2={plot.bottom} className="grat-line" />
            <text x={px} y={plot.bottom + 14} className="grat-label" textAnchor="middle">
              {timeLabel(t, span)}
            </text>
          </g>
        )
      })}
      {/* 横線 (電圧) + 左端ラベル。0V は強調 */}
      {yTicks.map((v) => {
        const py = scales.y(v)
        const zero = v === 0
        return (
          <g key={`y${v}`}>
            <line
              x1={plot.left}
              y1={py}
              x2={plot.right}
              y2={py}
              className={zero ? 'grat-line zero' : 'grat-line'}
            />
            <text x={plot.left - 6} y={py + 3} className="grat-label" textAnchor="end">
              {v}
            </text>
          </g>
        )
      })}
      {/* 単位 */}
      {showY && (
        <text x={plot.left - 6} y={plot.top - 2} className="grat-unit" textAnchor="end">
          V
        </text>
      )}
      <text x={plot.right} y={plot.bottom + 14} className="grat-unit" textAnchor="end">
        s
      </text>
    </g>
  )
}
