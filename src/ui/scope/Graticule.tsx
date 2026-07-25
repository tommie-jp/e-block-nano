import type { ReactElement } from 'react'
import type { Scales } from './geometry'
import { minorTicks, niceTicks } from './ticks'

/** X 軸 (時間) 目盛りの目安本数。cropped 窓でも綺麗な刻みになるよう多め */
const X_TICKS = 6
const Y_TICKS = 5
/** 副目盛りの刻み長さ [px] と色 */
const MINOR_LEN = 4
const MINOR_STROKE = '#4a5a68'
/** 電流(右)軸のラベル色 (WaveformChart の CURRENT_COLORS[0] と揃える) */
const CURRENT_LABEL = '#ffd54f'

/** 時間ラベルの桁数: 窓幅が狭い (発振クロップ時) ほど細かく */
const timeLabel = (t: number, span: number): string =>
  `${t.toFixed(span < 1 ? 3 : span < 10 ? 2 : 1)}`

/** 電流ラベル(mA)の桁数: レンジが小さいほど細かく */
const currentLabel = (mA: number, span: number): string =>
  `${mA.toFixed(span < 1 ? 2 : span < 10 ? 1 : 0)}`

/**
 * オシロのグレーティクル: X (時間) / Y (電圧) の格子線・主/副目盛り・単位。
 * currentRange (mA) を渡すと右側に電流の目盛り軸を足す。0V 基準線は強調。
 * 段組みでは Y (電圧) 軸が意味を持たないので showY=false で X (時間) のみ描く。
 */
export const Graticule = ({
  scales,
  showY = true,
  currentRange,
}: {
  scales: Scales
  showY?: boolean
  /** 電流の右軸レンジ [mA]。渡すと右側に電流目盛りを描く */
  currentRange?: { min: number; max: number }
}): ReactElement => {
  const { plot, win, yRange } = scales
  const span = win.end - win.start
  const xTicks = niceTicks(win.start, win.end, X_TICKS)
  const xMinor = minorTicks(win.start, win.end, X_TICKS)
  const yTicks = showY ? niceTicks(yRange.min, yRange.max, Y_TICKS) : []
  const yMinor = showY ? minorTicks(yRange.min, yRange.max, Y_TICKS) : []

  // 電流右軸 (mA)。plot 領域に currentRange をマップ
  const iTicks = currentRange ? niceTicks(currentRange.min, currentRange.max, Y_TICKS) : []
  const iMinor = currentRange ? minorTicks(currentRange.min, currentRange.max, Y_TICKS) : []
  const iSpan = currentRange ? currentRange.max - currentRange.min || 1 : 1
  const iMin = currentRange?.min ?? 0
  const yI = (mA: number): number => plot.bottom - ((mA - iMin) / iSpan) * plot.height

  return (
    <g className="graticule">
      {/* X 主目盛り (縦格子線 + 下端ラベル) */}
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
      {/* X 副目盛り (下端の短い刻み) */}
      {xMinor.map((t) => {
        const px = scales.x(t)
        return (
          <line
            key={`xm${t}`}
            x1={px}
            y1={plot.bottom}
            x2={px}
            y2={plot.bottom - MINOR_LEN}
            stroke={MINOR_STROKE}
            strokeWidth={1}
          />
        )
      })}

      {/* Y 主目盛り (横格子線 + 左端ラベル)。0V は強調 */}
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
      {/* Y 副目盛り (左端の短い刻み) */}
      {yMinor.map((v) => {
        const py = scales.y(v)
        return (
          <line
            key={`ym${v}`}
            x1={plot.left}
            y1={py}
            x2={plot.left + MINOR_LEN}
            y2={py}
            stroke={MINOR_STROKE}
            strokeWidth={1}
          />
        )
      })}

      {/* 電流 右軸 (mA)。主目盛り(刻み+ラベル) と副目盛り */}
      {currentRange && (
        <>
          {iTicks.map((mA) => {
            const py = yI(mA)
            return (
              <g key={`i${mA}`}>
                <line
                  x1={plot.right}
                  y1={py}
                  x2={plot.right - MINOR_LEN * 1.5}
                  y2={py}
                  stroke={MINOR_STROKE}
                  strokeWidth={1}
                />
                <text
                  x={plot.right + 5}
                  y={py + 3}
                  className="grat-label"
                  fill={CURRENT_LABEL}
                  textAnchor="start"
                >
                  {currentLabel(mA, iSpan)}
                </text>
              </g>
            )
          })}
          {iMinor.map((mA) => {
            const py = yI(mA)
            return (
              <line
                key={`im${mA}`}
                x1={plot.right}
                y1={py}
                x2={plot.right - MINOR_LEN}
                y2={py}
                stroke={MINOR_STROKE}
                strokeWidth={1}
              />
            )
          })}
        </>
      )}

      {/* 単位 (目盛りラベルと重ならない外側の角に置く) */}
      {showY && (
        <text x={4} y={plot.top + 4} className="grat-unit" textAnchor="start">
          V
        </text>
      )}
      <text x={plot.right} y={plot.bottom + 24} className="grat-unit" textAnchor="end">
        s
      </text>
      {currentRange && (
        <text
          x={plot.right + 5}
          y={plot.top + 4}
          className="grat-unit"
          fill={CURRENT_LABEL}
          textAnchor="start"
        >
          mA
        </text>
      )}
    </g>
  )
}
