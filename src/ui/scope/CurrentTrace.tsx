import type { ReactElement } from 'react'
import { SERIES_COLORS } from '../waveProbes'

/**
 * 電流専用の軽量ライブトレース。電圧(V)と電流(mA)はスケールが桁違いなので、
 * 電圧オシロ({@link WaveformChart})とは別に、電流だけを mA 軸で描く。
 * time は電圧側と同じ 0 起点の窓を渡す(LiveScopePanel で正規化済み)。
 */

const W = 1000
const H = 150
const PAD = 8
const MAX_POINTS = 800

interface CurrentTraceProps {
  time: readonly number[]
  /** blockId → 電流系列[A] */
  currents: Readonly<Record<string, readonly number[]>>
  /** blockId → 表示名(素子ラベル)。無ければ blockId */
  labels?: Readonly<Record<string, string>>
  /** ボードで選択中の素子 blockId。太線＋他を薄くして強調 */
  selectedBlockId?: string | null
}

/** 電流[A] を読みやすい単位で */
const fmtI = (a: number): string => {
  const abs = Math.abs(a)
  if (abs >= 1e-3) return `${(a * 1e3).toFixed(2)} mA`
  if (abs >= 1e-6) return `${(a * 1e6).toFixed(1)} µA`
  return `${(a * 1e9).toFixed(0)} nA`
}

export const CurrentTrace = ({
  time,
  currents,
  labels,
  selectedBlockId,
}: CurrentTraceProps): ReactElement => {
  const ids = Object.keys(currents)
  const n = time.length

  // 全系列の電流レンジ(0 を必ず含める)
  let lo = 0
  let hi = 0
  for (const id of ids) {
    for (const v of currents[id]) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (hi - lo < 1e-12) hi = lo + 1e-9

  const tmin = n > 0 ? time[0] : 0
  const tmax = n > 0 ? time[n - 1] : 1
  const px = (t: number): number =>
    PAD + ((t - tmin) / (tmax - tmin || 1)) * (W - 2 * PAD)
  const py = (a: number): number =>
    H - PAD - ((a - lo) / (hi - lo)) * (H - 2 * PAD)
  const stride = Math.max(1, Math.ceil(n / MAX_POINTS))

  const polyline = (series: readonly number[]): string => {
    const pts: string[] = []
    for (let i = 0; i < n; i += stride) pts.push(`${px(time[i]).toFixed(1)},${py(series[i]).toFixed(1)}`)
    return pts.join(' ')
  }

  const yZero = py(0)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 150, background: '#000', border: '1px solid #333' }}
      >
        {/* 0 電流の基準線 */}
        <line x1={PAD} x2={W - PAD} y1={yZero} y2={yZero} stroke="#444" strokeWidth={1} />
        {ids.map((id, i) => {
          const sel = id === selectedBlockId
          return (
            <polyline
              key={id}
              points={polyline(currents[id])}
              fill="none"
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={sel ? 3 : 1.5}
              opacity={selectedBlockId && !sel ? 0.3 : 1}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, marginTop: 2 }}>
        {ids.length === 0 && <span style={{ opacity: 0.6 }}>(電流プローブのある素子がありません)</span>}
        {ids.map((id, i) => {
          const series = currents[id]
          const last = series.length > 0 ? series[series.length - 1] : 0
          const sel = id === selectedBlockId
          return (
            <span
              key={id}
              style={{
                color: SERIES_COLORS[i % SERIES_COLORS.length],
                fontWeight: sel ? 700 : 400,
                opacity: selectedBlockId && !sel ? 0.5 : 1,
              }}
            >
              {labels?.[id] ?? id}: {fmtI(last)}
              {sel ? ' ◀ 選択' : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}
