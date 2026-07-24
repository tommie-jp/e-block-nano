/** トリガのスロープ (立ち上がり / 立ち下がり) */
export type Slope = 'rising' | 'falling'

/**
 * 指定レベルを指定スロープで最初に横切る時刻を返す純関数 (無ければ null)。
 * .tran はバッチなので「取得」ではなく表示の位相合わせに使う:
 * この時刻を表示窓の左端に置くと、繰り返し波形がブレず静止して見える。
 * 交差区間は線形補間して正確な交差時刻を求める。
 */
export const triggerTime = (
  time: readonly number[],
  values: readonly number[],
  level: number,
  slope: Slope,
): number | null => {
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1]
    const b = values[i]
    const crossed =
      slope === 'rising' ? a < level && b >= level : a > level && b <= level
    if (crossed) {
      const f = b !== a ? (level - a) / (b - a) : 0
      return time[i - 1] + f * (time[i] - time[i - 1])
    }
  }
  return null
}
