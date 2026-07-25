import type { ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { magnitudeSpectrum } from '../../core/simulation/spice/fft'
import type { FftWindow } from '../../core/simulation/spice/fft'
import { formatWithPrefix, pickPrefix } from '../../core/scope/siPrefix'
import { plotBox } from './geometry'
import { axisLabel, niceTicks } from './ticks'

interface FftPlotProps {
  waveforms: Waveforms
  nodeId: string
  color: string
  label: string
  /** 窓関数 (既定 Hann)。矩形は分解能重視、Hamming は側波が低い */
  window?: FftWindow
}

/** 周波数の目盛り。単位記号は軸の右下にまとめて出すので数字だけ */
const fmtTick = (f: number, scale: number, step: number): string =>
  axisLabel(f, step, scale)

/**
 * FFT モード: 選択ノードの片側振幅スペクトルを周波数領域で描く。
 * 発振の基本波・高調波を棒グラフ状に見せる。表示帯域はエネルギーが収まる範囲へ自動調整。
 */
export const FftPlot = ({
  waveforms,
  nodeId,
  color,
  label,
  window = 'hann',
}: FftPlotProps): ReactElement => {
  const box = plotBox()
  const { freqs, mags } = magnitudeSpectrum(
    waveforms.time,
    waveforms.nodeVoltages[nodeId] ?? [],
    undefined,
    window,
  )

  if (freqs.length === 0) {
    return (
      <text x={(box.left + box.right) / 2} y={(box.top + box.bottom) / 2} className="wave-overlay" textAnchor="middle">
        スペクトルなし
      </text>
    )
  }

  // ピークと、エネルギーが収まる上限周波数 (ピークの数倍) を求める
  let maxMag = 0
  let peakIdx = 0
  for (let k = 1; k < mags.length; k++) {
    if (mags[k] > maxMag) {
      maxMag = mags[k]
      peakIdx = k
    }
  }
  let lastSignif = peakIdx
  for (let k = 0; k < mags.length; k++) if (mags[k] > 0.02 * maxMag) lastSignif = k
  const fMax = Math.max(freqs[peakIdx] * 4, freqs[lastSignif] * 1.2, freqs[1] * 8)
  const yMax = maxMag || 1

  const sx = (f: number): number => box.left + (f / fMax) * box.width
  const sy = (m: number): number => box.bottom - (m / yMax) * box.height

  // fMax までのビンを縦棒 (area) で
  const bars: string[] = [`${box.left},${box.bottom}`]
  for (let k = 0; k < freqs.length && freqs[k] <= fMax; k++) {
    bars.push(`${sx(freqs[k])},${sy(mags[k])}`)
  }
  bars.push(`${sx(Math.min(fMax, freqs.at(-1)!))},${box.bottom}`)

  const fTicks = niceTicks(0, fMax, 6)
  // 周波数軸の接頭辞 (Hz / kHz / MHz) は帯域の広さで決める
  const fUnit = pickPrefix(fMax, 'Hz')
  const fStep = fTicks.length > 1 ? fTicks[1] - fTicks[0] : 0

  return (
    <g className="fftplot">
      {fTicks.map((f) => (
        <g key={f}>
          <line x1={sx(f)} y1={box.top} x2={sx(f)} y2={box.bottom} className="grat-line" />
          <text x={sx(f)} y={box.bottom + 12} className="grat-label" textAnchor="middle">
            {fmtTick(f, fUnit.scale, fStep)}
          </text>
        </g>
      ))}
      <line x1={box.left} y1={box.bottom} x2={box.right} y2={box.bottom} className="grat-line zero" />
      <polygon className="fft-area" points={bars.join(' ')} fill={color} />
      {/* ピーク周波数の注記 */}
      <line
        x1={sx(freqs[peakIdx])}
        y1={box.top}
        x2={sx(freqs[peakIdx])}
        y2={box.bottom}
        className="fft-peak"
      />
      <text x={sx(freqs[peakIdx]) + 4} y={box.top + 10} className="grat-label">
        {label}: {formatWithPrefix(freqs[peakIdx], 'Hz')}
      </text>
      <text x={box.right} y={box.bottom + 12} className="grat-unit" textAnchor="end">
        {fUnit.label}
      </text>
    </g>
  )
}
