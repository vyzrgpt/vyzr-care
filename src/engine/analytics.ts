import { ANALYSIS_CONFIG } from './config'
import { SIGNALS } from './signals'
import type { Direction, Observation, Patient, SeriesAnalysis, SignalDefinition, SignalId } from './types'

export const HOUR_MS = 3_600_000

export function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / HOUR_MS
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

/** Whether a change of `delta` is in the signal's worsening direction (ignoring noise). */
export function isWorseningDirection(def: SignalDefinition, delta: number, from: number): boolean {
  if (delta === 0) return false
  if (def.worse === 'up') return delta > 0
  if (def.worse === 'down') return delta < 0
  const centre = rangeCentre(def)
  return Math.abs(from + delta - centre) > Math.abs(from - centre)
}

/** Whether a change of `delta` is in the signal's worsening direction and beyond noise. */
export function isWorseningDelta(def: SignalDefinition, delta: number, from: number): boolean {
  if (Math.abs(delta) <= def.noise) return false
  if (def.worse === 'up') return delta > 0
  if (def.worse === 'down') return delta < 0
  // 'both': moving away from the centre of the range is worsening
  const centre = rangeCentre(def)
  return Math.abs(from + delta - centre) > Math.abs(from - centre)
}

function rangeCentre(def: SignalDefinition): number {
  if (def.low !== undefined && def.high !== undefined) return (def.low + def.high) / 2
  if (def.low !== undefined) return def.low
  if (def.high !== undefined) return def.high
  return 0
}

function directionOf(def: SignalDefinition, delta: number): Direction {
  if (Math.abs(delta) <= def.noise) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

export function observationsUpTo(patient: Patient, signal: SignalId, asOf: string): Observation[] {
  const cutoff = new Date(asOf).getTime()
  return patient.observations
    .filter((o) => o.signal === signal && new Date(o.time).getTime() <= cutoff)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

export function analyseSeries(patient: Patient, signal: SignalId, asOf: string): SeriesAnalysis | null {
  const def = SIGNALS[signal]
  const points = observationsUpTo(patient, signal, asOf)
  if (points.length === 0) return null

  const latestPoint = points[points.length - 1]
  const latest = latestPoint.value
  const previous = points.length > 1 ? points[points.length - 2].value : null
  const chronic = patient.baselines[signal]
  const baseline = chronic ?? points[0].value
  const baselineSource: SeriesAnalysis['baselineSource'] = chronic !== undefined ? 'chronic' : 'admission'
  const deltaBaseline = latest - baseline
  const relativeDeltaBaseline = baseline !== 0 ? deltaBaseline / Math.abs(baseline) : 0
  const spanHours = hoursBetween(points[0].time, latestPoint.time)

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
    Math.abs(latest - chronic) <= def.noise * ANALYSIS_CONFIG.chronicToleranceNoiseMultiple &&
    persistence < 2

  return {
    signal: def,
    points,
    latest,
    latestTime: latestPoint.time,
    previous,
    spanHours,
    abnormal,
    magnitude,
    deltaPrevious,
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

/**
 * A series shows a sustained move in the worsening direction: either the latest change
 * is worsening with persistence, or the value has drifted from baseline by more than noise
 * in the worsening direction across the admission.
 */
export function hasWorseningTrend(s: SeriesAnalysis): boolean {
  if (s.worsening && s.persistence >= 1) return true
  return isWorseningDelta(s.signal, s.deltaBaseline, s.baseline) && Math.abs(s.deltaBaseline) > s.signal.noise * 2
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
  return towardNormal && Math.abs(s.deltaBaseline) > s.signal.noise * 2
}

/** Hours until the series crosses `threshold` at its current velocity, or null if it will not. */
export function hoursToThreshold(s: SeriesAnalysis, threshold: number): number | null {
  if (s.velocityPerDay === null || s.velocityPerDay === 0) return null
  const remaining = threshold - s.latest
  if (Math.sign(remaining) !== Math.sign(s.velocityPerDay)) return null
  if (remaining === 0) return 0
  return (remaining / s.velocityPerDay) * 24
}
