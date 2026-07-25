import type { ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { Scales } from './geometry'
import { Graticule } from './Graticule'
import { laneBand } from './lanes'
import {
  headPointAt,
  MAX_POINTS,
  polylinePoints,
  revealedPoints,
  stackedMapper,
} from './polyline'
import { MATH_KEY } from './traceSeries'
import type { DrawTrace } from './traceSeries'

interface TimePlotProps {
  scales: Scales
  time: readonly number[]
  /** 電圧 (＋ Math) トレース */
  traces: readonly DrawTrace[]
  /** 素子電流トレース (overlay では右 mA 軸、段組みでは 1 レーンずつ) */
  currentTraces: readonly DrawTrace[]
  /** 電流の右軸レンジ [A] */
  iRange: { min: number; max: number }
  stacked: boolean
  gain: number
  /** 掃引再生中か。true の間は輝線が左→右に伸びる */
  sweeping: boolean
  /** 掃引ヘッドの時刻 [s] */
  tHead: number
  /** 重ね比較する参照波形 (薄い破線) */
  reference?: Waveforms | null
  /** ボードで選択中の素子。電流トレースを太線＋他を薄くして強調 */
  selectedBlockId?: string | null
}

/**
 * 時間ビューの描画。グレーティクル・参照波形・トレース (重ね / 段組み)・
 * 電流の右軸重ね・掃引輝点を描く。状態は持たず、渡された系列を描くだけ。
 */
export const TimePlot = ({
  scales,
  time,
  traces,
  currentTraces,
  iRange,
  stacked,
  gain,
  sweeping,
  tHead,
  reference,
  selectedBlockId,
}: TimePlotProps): ReactElement => {
  const hasCurrents = currentTraces.length > 0
  const allTraces = [...traces, ...currentTraces]
  const win = scales.win

  const points = (values: readonly number[], y: (v: number) => number): string =>
    polylinePoints(time, values, win.start, scales.x, y, MAX_POINTS)
  const revealed = (values: readonly number[], y: (v: number) => number): string =>
    revealedPoints(time, values, win.start, tHead, scales.x, y, MAX_POINTS)
  const head = (values: readonly number[], y: (v: number) => number) =>
    headPointAt(time, values, tHead, scales.x, y)

  /** 電流 [A] → SVG y (overlay の右 mA 軸) */
  const yI = (a: number): number => {
    const { top, bottom } = scales.plot
    return bottom - ((a - iRange.min) / (iRange.max - iRange.min)) * (bottom - top)
  }

  return (
    <>
      <Graticule
        scales={scales}
        showY={!stacked}
        currentRange={
          !stacked && hasCurrents
            ? { min: iRange.min * 1000, max: iRange.max * 1000 }
            : undefined
        }
      />

      {!stacked &&
        reference &&
        traces.map((t) => {
          const ref = reference.nodeVoltages[t.key]
          return ref ? (
            <polyline
              key={`ref-${t.key}`}
              className="wave-line reference"
              stroke={t.color}
              points={polylinePoints(
                reference.time,
                ref,
                win.start,
                scales.x,
                scales.y,
                MAX_POINTS,
              )}
            />
          ) : null
        })}

      {(stacked ? allTraces : traces).map((t, i) => {
        if (stacked) {
          const lane = laneBand(i, allTraces.length, scales.plot)
          const y = stackedMapper(lane, t.values, gain)
          const dot = sweeping ? head(t.values, y) : null
          return (
            <g key={t.key}>
              <line
                x1={scales.plot.left}
                y1={lane.cy}
                x2={scales.plot.right}
                y2={lane.cy}
                className="lane-baseline"
              />
              <text
                x={scales.plot.left + 2}
                y={lane.cy - lane.half + 9}
                className="lane-label"
                fill={t.color}
              >
                {t.label}
              </text>
              {sweeping && (
                <polyline
                  className="wave-line sweep-bg"
                  stroke={t.color}
                  points={points(t.values, y)}
                />
              )}
              <polyline
                className="wave-line"
                stroke={t.color}
                points={sweeping ? revealed(t.values, y) : points(t.values, y)}
              />
              {dot && (
                <circle
                  className="sweep-dot"
                  cx={dot.x}
                  cy={dot.y}
                  r={3}
                  fill={t.color}
                  style={{ color: t.color }}
                />
              )}
            </g>
          )
        }
        const cls =
          t.key === MATH_KEY
            ? 'wave-line math'
            : t.constant
              ? 'wave-line constant'
              : 'wave-line'
        const dot = sweeping ? head(t.values, scales.y) : null
        return (
          <g key={t.key}>
            {sweeping && (
              <polyline
                className={`${cls} sweep-bg`}
                stroke={t.color}
                points={points(t.values, scales.y)}
              />
            )}
            <polyline
              className={cls}
              stroke={t.color}
              points={
                sweeping ? revealed(t.values, scales.y) : points(t.values, scales.y)
              }
            />
            {dot && (
              <circle
                className="sweep-dot"
                cx={dot.x}
                cy={dot.y}
                r={3}
                fill={t.color}
                style={{ color: t.color }}
              />
            )}
          </g>
        )
      })}

      {/* overlay 時: 電流を右 mA 軸に破線で重ねる */}
      {!stacked &&
        currentTraces.map((t) => {
          const sel = t.key === `i:${selectedBlockId}`
          return (
            <polyline
              key={t.key}
              className="wave-line"
              stroke={t.color}
              strokeDasharray="5 3"
              strokeWidth={sel ? 2.5 : 1.2}
              opacity={selectedBlockId && !sel ? 0.3 : 1}
              points={sweeping ? revealed(t.values, yI) : points(t.values, yI)}
            />
          )
        })}
    </>
  )
}
