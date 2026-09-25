import { SIGNALS, formatValue, type Observation, type SignalId } from '../engine'

interface Props {
  signal: SignalId
  points: Observation[]
  /** Analysis horizon: points after this are drawn faintly (future during replay). */
  asOf: string
  width?: number
  height?: number
}

/** Small SVG trend line with the reference range shaded. */
export function Sparkline({ signal, points, asOf, width = 220, height = 56 }: Props) {
  const def = SIGNALS[signal]
  if (points.length === 0) return null
  const times = points.map((p) => new Date(p.time).getTime())
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const values = points.map((p) => p.value)
  const lo = Math.min(...values, def.low ?? Infinity)
  const hi = Math.max(...values, def.high ?? -Infinity)
  const pad = Math.max((hi - lo) * 0.15, def.noise)
  const vMin = lo - pad
  const vMax = hi + pad
  const padX = 6
  const padY = 5
  const x = (t: number) => (t1 === t0 ? width / 2 : padX + ((t - t0) / (t1 - t0)) * (width - padX * 2))
  const y = (v: number) => padY + (1 - (v - vMin) / (vMax - vMin)) * (height - padY * 2)

  const asOfMs = new Date(asOf).getTime()
  const seen = points.filter((p) => new Date(p.time).getTime() <= asOfMs)
  const future = points.filter((p) => new Date(p.time).getTime() > asOfMs)
  const path = (pts: Observation[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(new Date(p.time).getTime()).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const bandTop = def.high !== undefined ? y(def.high) : padY
  const bandBottom = def.low !== undefined ? y(def.low) : height - padY
  const last = seen[seen.length - 1]

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${def.label} trend`}>
      <rect x={0} y={Math.min(bandTop, bandBottom)} width={width} height={Math.abs(bandBottom - bandTop)} className="spark-band" />
      {future.length > 0 && last && <path d={path([last, ...future])} className="spark-future" />}
      <path d={path(seen)} className="spark-line" />
      {seen.map((p) => (
        <circle key={p.time} cx={x(new Date(p.time).getTime())} cy={y(p.value)} r={2.6} className="spark-dot" />
      ))}
      {last && (
        <text x={Math.min(x(new Date(last.time).getTime()) + 4, width - 28)} y={Math.max(y(last.value) - 6, 10)} className="spark-label">
          {formatValue(signal, last.value)}
        </text>
      )}
    </svg>
  )
}
