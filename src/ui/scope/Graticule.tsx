import type { ReactElement } from 'react'
import type { Scales } from './geometry'
import { minorTicks, niceTicks } from './ticks'

/** X 軸 (時間) 目盛りの目安本数。cropped 窓でも綺麗な刻みになるよう多め */
const X_TICKS = 6
const Y_TICKS = 5
/** 副目盛りの刻み長さ [px] と色 */
const MINOR_LEN = 4
const MINOR_STROKE = '#4a5a68'
/** 右軸のラベル色 (電流/電力トレースの 1 色目と揃える) */
const RIGHT_LABEL = '#ffd54f'

/** 時間ラベルの桁数: 窓幅が狭い (発振クロップ時) ほど細かく */
const timeLabel = (t: number, span: number): string =>
  `${t.toFixed(span < 1 ? 3 : span < 10 ? 2 : 1)}`

/** 右軸ラベルの桁数: レンジが小さいほど細かく */
const rightLabel = (v: number, span: number): string =>
  `${v.toFixed(span < 1 ? 2 : span < 10 ? 1 : 0)}`

/**
 * オシロのグレーティクル: X (時間) / 左 Y の格子線・主/副目盛り・単位。
 * `rightAxis` を渡すと右側にもう 1 本の目盛り軸を足す (単位はペインが決める。
 * 値は表示単位に換算済みで渡すこと)。0 基準線は強調する。
 */
export const Graticule = ({
  scales,
  leftUnit = 'V',
  rightAxis,
}: {
  scales: Scales
  /** 左軸の単位記号 (V / mA / mW) */
  leftUnit?: string
  /** 右軸のレンジと単位記号 (表示単位に換算済み) */
  rightAxis?: { min: number; max: number; unit: string }
}): ReactElement => {
  const { plot, win, yRange } = scales
  const span = win.end - win.start
  const xTicks = niceTicks(win.start, win.end, X_TICKS)
  const xMinor = minorTicks(win.start, win.end, X_TICKS)
  const yTicks = niceTicks(yRange.min, yRange.max, Y_TICKS)
  const yMinor = minorTicks(yRange.min, yRange.max, Y_TICKS)

  // 右軸。plot 領域に rightAxis のレンジをマップ
  const iTicks = rightAxis ? niceTicks(rightAxis.min, rightAxis.max, Y_TICKS) : []
  const iMinor = rightAxis ? minorTicks(rightAxis.min, rightAxis.max, Y_TICKS) : []
  const iSpan = rightAxis ? rightAxis.max - rightAxis.min || 1 : 1
  const iMin = rightAxis?.min ?? 0
  const yI = (v: number): number => plot.bottom - ((v - iMin) / iSpan) * plot.height

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

      {/* 右軸。主目盛り(刻み+ラベル) と副目盛り */}
      {rightAxis && (
        <>
          {iTicks.map((value) => {
            const py = yI(value)
            return (
              <g key={`i${value}`}>
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
                  fill={RIGHT_LABEL}
                  textAnchor="start"
                >
                  {rightLabel(value, iSpan)}
                </text>
              </g>
            )
          })}
          {iMinor.map((value) => {
            const py = yI(value)
            return (
              <line
                key={`im${value}`}
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
      <text x={4} y={plot.top + 4} className="grat-unit" textAnchor="start">
        {leftUnit}
      </text>
      <text x={plot.right} y={plot.bottom + 24} className="grat-unit" textAnchor="end">
        s
      </text>
      {rightAxis && (
        <text
          x={plot.right + 5}
          y={plot.top + 4}
          className="grat-unit"
          fill={RIGHT_LABEL}
          textAnchor="start"
        >
          {rightAxis.unit}
        </text>
      )}
    </g>
  )
}
