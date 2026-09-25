/**
 * Temporal trend analysis for a single signal. Pure functions over normalised series.
 * Thresholds referenced here come from `config.ts` and `signals.ts` (DEMO / NOT CLINICALLY VALIDATED).
 */
import { ANALYSIS_CONFIG } from './config'
import type { NormalizedPatient } from './normalize'
import { SIGNALS } from './signals'
import type { Direction, SeriesAnalysis, SeriesPoint, SignalDefinition, SignalId } from './types'

export const HOUR_MS = 3_600_000

export function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / HOUR_MS
}

/** Floating-point guard so that e.g. 1.1 − 1.0 does not exceed a noise band of 0.1. */
const EPS = 1e-9

/** Whether |delta| is larger than `multiple` × the signal's noise band. */
export function exceedsNoise(def: SignalDefinition, delta: number, multiple = 1): boolean {
  return Math.abs(delta) > def.noise * multiple + EPS
}

export function abnormalSide(def: SignalDefinition, value: number): 'high' | 'low' | null {
  if (def.high !== undefined && value > def.high) return 'high'
  if (def.low !== undefined && value < def.low) return 'low'
  return null
}

/** Distance outside the reference range, normalised by the signal's clinical scale. */
export function abnormalMagnitude(def: SignalDefinition, value: number): number {
  const side = abnormalSide(def, value)
  if (side === 'high' && def.high !== undefined) return (value - def.high) / def.scale
  if (side === 'low' && def.low !== undefined) return (def.low - value) / def.scale
  return 0
}

/**
 * The definition used to analyse a series: the registry entry, with the reference range
 * replaced by the source-supplied range of the most recent point when one is present.
 */
export function effectiveDefinition(def: SignalDefinition, points: SeriesPoint[]): SignalDefinition {
  const range = points.length ? points[points.length - 1].referenceRange : undefined
  if (!range) return def
  return { ...def, low: range.low ?? def.low, high: range.high ?? def.high }
}

/** Whether a change of `delta` is in the signal's worsening direction (ignoring noise). */
export function isWorseningDirection(def: SignalDefinition, delta: number, from: number): boolean {
  if (delta === 0) return false
  if (def.worse === 'up') return delta > 0
  if (def.worse === 'down') return delta < 0
  return bidirectionalWorsening(def, from, from + delta)
}

/** Whether a change of `delta` is in the signal's worsening direction and beyond noise. */
export function isWorseningDelta(def: SignalDefinition, delta: number, from: number): boolean {
  if (!exceedsNoise(def, delta)) return false
  return isWorseningDirection(def, delta, from)
}

/**
 * For 'both'-direction signals: landing outside the range on a side the series did not start
 * on is worsening, otherwise moving away from the centre of the range is worsening. Signals
 * without any bound (e.g. urine osmolality) have no defined worsening direction.
 */
function bidirectionalWorsening(def: SignalDefinition, from: number, to: number): boolean {
  const centre = rangeCentre(def)
  if (centre === null) return false
  const toSide = abnormalSide(def, to)
  if (toSide !== null && toSide !== abnormalSide(def, from)) return true
  return Math.abs(to - centre) > Math.abs(from - centre)
}

function rangeCentre(def: SignalDefinition): number | null {
  if (def.low !== undefined && def.high !== undefined) return (def.low + def.high) / 2
  if (def.low !== undefined) return def.low
  if (def.high !== undefined) return def.high
  return null
}

function directionOf(def: SignalDefinition, delta: number): Direction {
  if (!exceedsNoise(def, delta)) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

export function analyseSeries(patient: NormalizedPatient, signal: SignalId): SeriesAnalysis | null {
  const points = patient.series[signal] ?? []
  if (points.length === 0) return null
  const def = effectiveDefinition(SIGNALS[signal], points)

  const latestPoint = points[points.length - 1]
  const latest = latestPoint.value
  const previous = points.length > 1 ? points[points.length - 2].value : null
  const chronic = patient.record.knownBaselines[signal]
  const baseline = chronic ?? points[0].value
  const baselineSource: SeriesAnalysis['baselineSource'] = chronic !== undefined ? 'chronic' : 'admission'
  const deltaBaseline = latest - baseline
  const relativeDeltaBaseline = baseline !== 0 ? deltaBaseline / Math.abs(baseline) : 0
  const spanHours = hoursBetween(points[0].time, latestPoint.time)
  const hoursSinceLatest = Math.max(0, hoursBetween(latestPoint.time, patient.asOf))

  // Per-interval velocities (units per day)
  const velocities: number[] = []
  for (let i = 1; i < points.length; i++) {
    const h = hoursBetween(points[i - 1].time, points[i].time)
    if (h > 0) velocities.push(((points[i].value - points[i - 1].value) / h) * 24)
  }
  const velocityPerDay = velocities.length ? velocities[velocities.length - 1] : null
  const accelerationPerDay =
    velocities.length >= 2 ? velocities[velocities.length - 1] - velocities[velocities.length - 2] : null

  const deltaPrevious = previous !== null ? latest - previous : null
  const relativeDeltaPrevious = previous !== null && previous !== 0 && deltaPrevious !== null ? deltaPrevious / Math.abs(previous) : null
  // Direction of the latest move; if the last interval is within noise, look across the last two
  // intervals so that slow drifts made of sub-noise steps are still recognised.
  let direction: Direction = deltaPrevious !== null ? directionOf(def, deltaPrevious) : 'flat'
  if (direction === 'flat' && points.length >= 3 && deltaPrevious !== null) {
    const twoInterval = latest - points[points.length - 3].value
    if (deltaPrevious === 0 || Math.sign(deltaPrevious) === Math.sign(twoInterval)) {
      direction = directionOf(def, twoInterval)
    }
  }

  // Persistence: consecutive intervals (latest backwards) moving the same way as `direction`.
  let persistence = 0
  let runStart = latest
  if (direction !== 'flat') {
    for (let i = points.length - 1; i >= 1; i--) {
      const d = points[i].value - points[i - 1].value
      if (d !== 0 && Math.sign(d) === (direction === 'up' ? 1 : -1)) {
        persistence++
        runStart = points[i - 1].value
      } else break
    }
  }
  const runChange = Math.abs(latest - runStart)

  // Reversal: latest move opposes a preceding run of >= 2 intervals.
  let reversal = false
  if (direction !== 'flat' && points.length >= 4) {
    const opposite: Direction = direction === 'up' ? 'down' : 'up'
    let run = 0
    for (let i = points.length - 2; i >= 1; i--) {
      const d = points[i].value - points[i - 1].value
      if (directionOf(def, d) === opposite) run++
      else break
    }
    reversal = run >= 2
  }

  const abnormal = abnormalSide(def, latest)
  const magnitude = abnormalMagnitude(def, latest)
  const everAbnormal = points.some((p) => abnormalSide(def, p.value) !== null)

  const runDelta = latest - runStart
  const worsening = direction !== 'flat' && isWorseningDelta(def, runDelta, runStart)
  const improving =
    direction !== 'flat' &&
    !isWorseningDelta(def, runDelta, runStart) &&
    // improvement only counts if the series was abnormal at some point
    everAbnormal

  const projected24h = velocityPerDay !== null ? latest + velocityPerDay : null
  const approachingAbnormal =
    abnormal === null &&
    projected24h !== null &&
    persistence >= 1 &&
    abnormalSide(def, projected24h) !== null &&
    isWorseningDelta(def, projected24h - latest, latest)

  const chronicStable =
    chronic !== undefined &&
    abnormalSide(def, chronic) !== null &&
    abnormal !== null &&
    !exceedsNoise(def, latest - chronic, ANALYSIS_CONFIG.chronicToleranceNoiseMultiple) &&
    persistence < 2

  return {
    signal: def,
    points,
    latest,
    latestTime: latestPoint.time,
    hoursSinceLatest,
    previous,
    spanHours,
    abnormal,
    magnitude,
    deltaPrevious,
    relativeDeltaPrevious,
    baseline,
    baselineSource,
    deltaBaseline,
    relativeDeltaBaseline,
    velocityPerDay,
    accelerationPerDay,
    direction,
    persistence,
    runChange,
    reversal,
    worsening,
    improving,
    approachingAbnormal,
    projected24h,
    chronicStable,
    everAbnormal,
  }
}

/** Net change over the most recent two intervals (or one, for two-point series). */
function recentDelta(s: SeriesAnalysis): { delta: number; from: number } | null {
  const n = s.points.length
  if (n < 2) return null
  const from = s.points[Math.max(0, n - 3)].value
  return { delta: s.latest - from, from }
}

/**
 * A series shows a sustained move in the worsening direction: either the latest change
 * is worsening with persistence, or the value has drifted from baseline by more than noise
 * in the worsening direction across the admission *and is still moving that way* over the
 * most recent intervals. A meaningful latest move toward normal takes precedence over
 * historical displacement, and a plateau (no recent movement) is not worsening.
 */
export function hasWorseningTrend(s: SeriesAnalysis): boolean {
  if (s.worsening && s.persistence >= 1) return true
  if (s.improving && s.persistence >= 1) return false
  const recent = recentDelta(s)
  if (!recent || !isWorseningDirection(s.signal, recent.delta, recent.from)) return false
  return isWorseningDelta(s.signal, s.deltaBaseline, s.baseline) && exceedsNoise(s.signal, s.deltaBaseline, 2)
}

/**
 * A worsening trend worth surfacing. Abnormal values qualify on any sustained worsening;
 * within-range values must be approaching abnormality or have moved by at least one
 * clinically meaningful step (`scale`) so that ordinary physiological variation stays quiet.
 */
export function hasMeaningfulWorsening(s: SeriesAnalysis): boolean {
  if (!hasWorseningTrend(s)) return false
  if (s.abnormal || s.approachingAbnormal) return true
  const moved = Math.max(s.runChange, Math.abs(s.deltaBaseline))
  return moved >= s.signal.scale * ANALYSIS_CONFIG.progressiveRunScale
}

export function hasImprovingTrend(s: SeriesAnalysis): boolean {
  if (!s.everAbnormal) return false
  if (s.improving && s.persistence >= 1) return true
  const towardNormal = !isWorseningDelta(s.signal, s.deltaBaseline, s.baseline)
  return towardNormal && exceedsNoise(s.signal, s.deltaBaseline, 2)
}

/** Hours until the series crosses `threshold` at its current velocity, or null if it will not. */
export function hoursToThreshold(s: SeriesAnalysis, threshold: number): number | null {
  if (s.velocityPerDay === null || s.velocityPerDay === 0) return null
  const remaining = threshold - s.latest
  if (Math.sign(remaining) !== Math.sign(s.velocityPerDay)) return null
  if (remaining === 0) return 0
  return (remaining / s.velocityPerDay) * 24
}
