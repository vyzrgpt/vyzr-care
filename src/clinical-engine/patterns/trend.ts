/**
 * Single-signal temporal rule. Distinguishes, for one measurement:
 *   chronic stable abnormality · improving · rapidly worsening · progressive worsening ·
 *   short worsening worth watching · minor change / stable-but-abnormal · quiet (returns null).
 */
import { ANALYSIS_CONFIG } from '../config'
import { knowledgeFor, type PreventionTemplate, type SignalKnowledge } from '../pattern-library'
import { cap, scoreImportance, severityFromScore } from '../scoring'
import { exceedsNoise, hasImprovingTrend, hasMeaningfulWorsening, hasWorseningTrend, hoursToThreshold, isWorseningDirection } from '../trends'
import type { ImportanceComponents, Prediction, SeriesAnalysis, TimeHorizon, Trajectory } from '../types'
import {
  associatedMedications,
  confidenceFromSeries,
  eventEvidence,
  isNewlyAbnormal,
  maxSeverity,
  medicationEvidence,
  missingSignals,
  seriesEvidence,
  type RawPattern,
  type RuleContext,
} from './context'

export const TREND_RULE_ID = 'single_signal_trend'
export const CHRONIC_RULE_ID = 'chronic_stable_abnormality'

const EMPTY_PREVENTION: PreventionTemplate = { causes: [], investigations: [], reviews: [], complicationToAvoid: null }

function relevantSide(s: SeriesAnalysis): 'high' | 'low' {
  if (s.abnormal) return s.abnormal
  const def = s.signal
  if (def.worse === 'up') return 'high'
  if (def.worse === 'down') return 'low'
  if (s.direction !== 'flat') return s.direction === 'up' ? 'high' : 'low'
  for (let i = s.points.length - 1; i >= 0; i--) {
    const v = s.points[i].value
    if (def.high !== undefined && v > def.high) return 'high'
    if (def.low !== undefined && v < def.low) return 'low'
  }
  return 'low'
}

function preventionFrom(k: SignalKnowledge | undefined): PreventionTemplate {
  if (!k) return EMPTY_PREVENTION
  return { causes: k.causes, investigations: k.investigations, reviews: k.reviews, complicationToAvoid: k.complication }
}

export function horizonFromHours(h: number | null): TimeHorizon | null {
  if (h === null || h < 0) return null
  if (h <= 12) return 'hours'
  if (h <= 24) return 'next_24h'
  if (h <= 48) return 'next_24_48h'
  return null
}

function isQuietSeverity(severity: RawPattern['severity']): boolean {
  return severity === 'stable' || severity === 'minor'
}

export function evaluateTrend(ctx: RuleContext, s: SeriesAnalysis): RawPattern | null {
  const def = s.signal
  const patientId = ctx.patient.record.patientId
  const base = {
    domain: def.domain,
    signals: [def.id],
    primarySignal: def.id,
    series: [s],
    confidence: confidenceFromSeries([s]),
  }

  if (s.chronicStable) {
    return {
      ...base,
      id: `${patientId}:${CHRONIC_RULE_ID}:${def.id}`,
      patternId: CHRONIC_RULE_ID,
      kind: 'chronic_stable_abnormality',
      title: `${def.label}: stable chronic abnormality`,
      severity: 'stable',
      trajectory: 'stable',
      detectedTrend: 'abnormal but unchanged from known baseline',
      horizon: null,
      evidence: [seriesEvidence(s, 'core')],
      missing: [],
      prevention: EMPTY_PREVENTION,
      importance: scoreImportance({ magnitude: cap(s.magnitude), chronicBaseline: 1 }),
      suppressedReason: `Consistent with known chronic baseline (${s.baseline.toFixed(def.decimals)} ${def.unit}); no new trend.`,
      projection: null,
    }
  }

  const worseningTrend = hasWorseningTrend(s)
  const improvingTrend = hasImprovingTrend(s) && !worseningTrend

  // Within range and not moving meaningfully: quiet.
  if (!s.abnormal && !improvingTrend && !hasMeaningfulWorsening(s)) return null

  const id = `${patientId}:${TREND_RULE_ID}:${def.id}`
  const side = relevantSide(s)
  const knowledge = knowledgeFor(def.id, side)
  const meds = knowledge ? associatedMedications(ctx, knowledge.associatedMedications) : []
  const medEvidence = knowledge ? medicationEvidence(meds, knowledge.medicationRelation) : []
  const symptomEvidence = eventEvidence(ctx, ['symptom', 'nursing'])

  if (improvingTrend) {
    const components: Partial<ImportanceComponents> = {
      magnitude: cap(s.magnitude),
      treatmentResponse: Math.min(3, Math.max(1, s.persistence)),
    }
    return {
      ...base,
      id,
      patternId: TREND_RULE_ID,
      kind: 'single_signal_trend',
      title: `${def.label}: improving`,
      severity: s.abnormal ? 'minor' : 'stable',
      trajectory: 'improving',
      detectedTrend: s.abnormal ? 'improving, still outside range' : 'improving, back within range',
      horizon: null,
      evidence: [seriesEvidence(s, 'core')],
      missing: [],
      prevention: { ...EMPTY_PREVENTION, reviews: ['Continue current plan; reassess if the trend reverses'] },
      importance: scoreImportance(components),
      suppressedReason: null,
      projection: null,
    }
  }

  // Worsening / abnormal branch
  const rate = s.velocityPerDay !== null && s.worsening ? Math.abs(s.velocityPerDay) / def.scale : 0
  const accelerating =
    s.worsening &&
    s.accelerationPerDay !== null &&
    s.velocityPerDay !== null &&
    Math.sign(s.accelerationPerDay) === Math.sign(s.velocityPerDay) &&
    exceedsNoise(def, s.accelerationPerDay)

  const newlyAbnormal = isNewlyAbnormal(s)
  const chronicDrift = s.baselineSource === 'chronic' && s.abnormal !== null && !s.chronicStable ? 0.5 : 0
  const onlyNoise = s.direction === 'flat' && s.magnitude < 0.5 ? 1 : 0

  const meaningfulRun = s.runChange >= def.scale * ANALYSIS_CONFIG.watchRunScale
  const components: Partial<ImportanceComponents> = {
    magnitude: cap(s.magnitude),
    rateOfChange: cap(rate),
    persistence: s.worsening ? Math.min(3, s.persistence) * (meaningfulRun ? 1 : 0.5) : 0,
    acceleration: accelerating && s.accelerationPerDay !== null ? cap(Math.abs(s.accelerationPerDay) / def.scale) : 0,
    context: Math.min(2, meds.length),
    novelty: (newlyAbnormal ? 1 : 0) + (s.approachingAbnormal ? 0.5 : 0),
    chronicBaseline: chronicDrift,
    noise: onlyNoise,
  }
  const importance = scoreImportance(components)

  const progressiveRun = s.runChange >= def.scale * ANALYSIS_CONFIG.progressiveRunScale
  let trajectory: Trajectory
  let detectedTrend: string
  if (s.worsening && s.persistence >= 2 && progressiveRun && rate >= ANALYSIS_CONFIG.rapidRatePerDay) {
    trajectory = 'rapidly_worsening'
    detectedTrend = `rapid, sustained ${s.direction === 'up' ? 'rise' : 'decline'} across ${s.persistence} consecutive measurements`
  } else if (s.worsening && s.persistence >= 2 && progressiveRun) {
    trajectory = 'worsening'
    detectedTrend = `progressive ${s.direction === 'up' ? 'rise' : 'decline'} across ${s.persistence} consecutive measurements`
  } else if (s.worsening && (meaningfulRun || s.approachingAbnormal)) {
    trajectory = 'worsening'
    detectedTrend = s.approachingAbnormal ? 'within range but moving toward the limit' : 'single-interval worsening change'
  } else if (!s.worsening && worseningTrend && Math.abs(s.deltaBaseline) >= def.scale * ANALYSIS_CONFIG.watchRunScale) {
    trajectory = 'worsening'
    detectedTrend = 'drift away from admission baseline'
  } else if (s.abnormal && s.direction === 'flat' && s.points.length > 2) {
    trajectory = 'stable'
    detectedTrend = 'abnormal but not significantly changing'
  } else {
    trajectory = 'minor_change'
    detectedTrend = 'minor change; no escalation signal'
  }
  const shortWatch = trajectory === 'worsening' && !(s.persistence >= 2 && progressiveRun)

  let severity = severityFromScore(importance.total)
  if (trajectory === 'rapidly_worsening') severity = maxSeverity(severity, 'watch')
  // An out-of-range value is never labelled "stable" unless it is a known chronic baseline.
  if (s.abnormal) severity = maxSeverity(severity, 'minor')

  // Time horizon: linear extrapolation toward the concern threshold, only for sustained worsening.
  let projection: Prediction['projection'] = null
  let horizon: TimeHorizon | null = null
  if (s.worsening && s.persistence >= 1 && s.projected24h !== null) {
    let threshold: number | null = knowledge?.concernThreshold ?? null
    if (threshold === null && knowledge?.concernThresholdBaselineMultiple) {
      threshold = s.baseline * knowledge.concernThresholdBaselineMultiple
    }
    const hours = threshold !== null ? hoursToThreshold(s, threshold) : null
    const validThreshold = threshold !== null && isWorseningDirection(def, threshold - s.latest, s.latest) ? threshold : null
    projection = {
      signal: def.id,
      value24h: s.projected24h,
      threshold: validThreshold,
      hoursToThreshold: validThreshold !== null ? hours : null,
    }
    horizon = validThreshold !== null ? horizonFromHours(hours) : null
  }

  const stateLabel = knowledge?.stateLabel ?? `${def.label.toLowerCase()} ${side === 'high' ? 'elevated' : 'low'}`
  const title =
    trajectory === 'rapidly_worsening' || (trajectory === 'worsening' && !shortWatch)
      ? `Progressive ${stateLabel}`
      : shortWatch
        ? `${def.label}: ${s.direction === 'up' ? 'rising' : 'falling'}`
        : `${def.label}: ${s.abnormal ? `mildly ${side}` : 'within range'}, ${trajectory === 'stable' ? 'stable' : 'minor change'}`

  const quiet = isQuietSeverity(severity)
  return {
    ...base,
    id,
    patternId: TREND_RULE_ID,
    kind: 'single_signal_trend',
    title,
    severity,
    trajectory,
    detectedTrend,
    horizon,
    evidence: [seriesEvidence(s, 'core'), ...medEvidence, ...(quiet ? [] : symptomEvidence)],
    missing: knowledge && !quiet ? missingSignals(ctx, knowledge.investigationSignals) : [],
    prevention: quiet ? EMPTY_PREVENTION : preventionFrom(knowledge),
    importance,
    suppressedReason: null,
    projection,
  }
}
