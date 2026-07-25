import type { ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { Scales } from './geometry'
import { Graticule } from './Graticule'
import {
  headPointAt,
  MAX_POINTS,
  polylinePoints,
  revealedPoints,
} from './polyline'
import type { DrawTrace } from './traceSeries'

interface TimePlotProps {
  /** 左軸のスケール (時間 x と左単位の y) */
  scales: Scales
  time: readonly number[]
  /** 左軸で描くトレース */
  leftTraces: readonly DrawTrace[]
  /** 右軸で描くトレース (別単位。無ければ空) */
  rightTraces: readonly DrawTrace[]
  leftUnit: string
  /** 左軸の値 → 表示単位の倍率 (目盛りの数字に掛ける) */
  leftScale?: number
  /** 右軸のレンジ (表示単位に換算済み) と単位記号 */
  rightAxis?: { min: number; max: number; unit: string }
  /** 右軸トレースの値 → 表示単位の倍率 (A→mA なら 1000) */
  rightScale?: number
  /** 掃引再生中か。true の間は輝線が左→右に伸びる */
  sweeping: boolean
  /** 掃引ヘッドの時刻 [s] */
  tHead: number
  /** 重ね比較する参照波形 (薄い破線)。電圧トレースにのみ効く */
  reference?: Waveforms | null
  /** ボードで選択中の素子。その電流/電力トレースを太線＋他を薄くして強調 */
  selectedBlockId?: string | null
}

/**
 * 1 ペインの時間ビュー。グレーティクル・参照波形・左軸トレース・右軸トレース
 * (別単位を破線で重ねる)・掃引輝点を描く。状態は持たず、渡された系列を描くだけ。
 */
export const TimePlot = ({
  scales,
  time,
  leftTraces,
  rightTraces,
  leftUnit,
  leftScale = 1,
  rightAxis,
  rightScale = 1,
  sweeping,
  tHead,
  reference,
  selectedBlockId,
}: TimePlotProps): ReactElement => {
  const win = scales.win

  const points = (values: readonly number[], y: (v: number) => number): string =>
    polylinePoints(time, values, win.start, win.end, scales.x, y, MAX_POINTS)
  const revealed = (values: readonly number[], y: (v: number) => number): string =>
    revealedPoints(time, values, win.start, tHead, scales.x, y, MAX_POINTS)
  const head = (values: readonly number[], y: (v: number) => number) =>
    headPointAt(time, values, tHead, scales.x, y)

  /** 右軸の生値 (A/W) → SVG y。レンジは表示単位なので値も換算して当てる */
  const yRight = (raw: number): number => {
    if (!rightAxis) return scales.plot.bottom
    const { top, bottom } = scales.plot
    const v = raw * rightScale
    return bottom - ((v - rightAxis.min) / (rightAxis.max - rightAxis.min)) * (bottom - top)
  }

  return (
    <>
      <Graticule
        scales={scales}
        leftUnit={leftUnit}
        leftScale={leftScale}
        rightAxis={rightAxis}
      />

      {reference &&
        leftTraces.map((t) =>
          t.expr.kind === 'v' && reference.nodeVoltages[t.expr.node] ? (
            <polyline
              key={`ref-${t.key}`}
              className="wave-line reference"
              stroke={t.color}
              points={polylinePoints(
                reference.time,
                reference.nodeVoltages[t.expr.node],
                win.start,
                win.end,
                scales.x,
                scales.y,
                MAX_POINTS,
              )}
            />
          ) : null,
        )}

      {leftTraces.map((t) => {
        const cls =
          t.expr.kind === 'vdiff'
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

      {/* 別単位のトレースは右軸に破線で重ねる */}
      {rightTraces.map((t) => {
        const block = t.expr.kind === 'i' || t.expr.kind === 'p' ? t.expr.block : null
        const sel = block !== null && block === selectedBlockId
        return (
          <polyline
            key={t.key}
            className="wave-line"
            stroke={t.color}
            strokeDasharray="5 3"
            strokeWidth={sel ? 2.5 : 1.2}
            opacity={selectedBlockId && !sel ? 0.3 : 1}
            points={sweeping ? revealed(t.values, yRight) : points(t.values, yRight)}
          />
        )
      })}
    </>
  )
}
