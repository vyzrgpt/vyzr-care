import { ANALYSIS_CONFIG } from '../config'
import { hasImprovingTrend, hasMeaningfulWorsening, hasWorseningTrend, hoursToThreshold, isWorseningDirection } from '../analytics'
import { knowledgeFor, type SignalKnowledge } from '../knowledge'
import { cap, scoreImportance, severityFromScore } from '../scoring'
import type { Finding, Horizon, ImportanceComponents, PreventionContent, SeriesAnalysis, Severity, Trajectory } from '../types'
import {
  associatedMedications,
  eventEvidence,
  isNewlyAbnormal,
  medicationEvidence,
  missingSignals,
  seriesEvidence,
  type RuleContext,
} from './context'

export const TREND_RULE_ID = 'single_signal_trend'

const EMPTY_PREVENTION: PreventionContent = { causes: [], investigations: [], reviews: [], complicationToAvoid: null }

function relevantSide(s: SeriesAnalysis): 'high' | 'low' {
  if (s.abnormal) return s.abnormal
  const def = s.signal
  if (def.worse === 'up') return 'high'
  if (def.worse === 'down') return 'low'
  if (s.direction !== 'flat') return s.direction === 'up' ? 'high' : 'low'
  // last abnormal point decides
  for (let i = s.points.length - 1; i >= 0; i--) {
    const v = s.points[i].value
    if (def.high !== undefined && v > def.high) return 'high'
    if (def.low !== undefined && v < def.low) return 'low'
  }
  return 'low'
}

function preventionFrom(k: SignalKnowledge | undefined): PreventionContent {
  if (!k) return EMPTY_PREVENTION
  return {
    causes: k.causes,
    investigations: k.investigations,
    reviews: k.reviews,
    complicationToAvoid: k.complication,
  }
}

export function horizonFromHours(h: number | null): Horizon | null {
  if (h === null || h < 0) return null
  if (h <= 12) return 'hours'
  if (h <= 24) return 'next_24h'
  if (h <= 48) return 'next_24_48h'
  return null
}

function maxSeverity(a: Severity, b: Severity): Severity {
  const order: Severity[] = ['stable', 'informational', 'watch', 'concerning', 'urgent']
  return order.indexOf(a) >= order.indexOf(b) ? a : b
}

/**
 * Evaluates a single longitudinal signal and returns a Finding, or null when the
 * signal is quiet (within range and not moving beyond noise).
 */
export function evaluateTrend(ctx: RuleContext, s: SeriesAnalysis): Finding | null {
  const def = s.signal
  const id = `${ctx.patient.id}:${TREND_RULE_ID}:${def.id}`
  const base = {
    id,
    patientId: ctx.patient.id,
    ruleId: TREND_RULE_ID,
    domain: def.domain,
    signals: [def.id],
    primarySignal: def.id,
    series: [s],
  }

  if (s.chronicStable) {
    return {
      ...base,
      kind: 'chronic_stable',
      title: `${def.label}: stable chronic abnormality`,
      severity: 'stable',
      trajectory: 'stable',
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

  if (!s.abnormal && !improvingTrend && !hasMeaningfulWorsening(s)) return null

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
    const importance = scoreImportance(components)
    return {
      ...base,
      kind: 'single_trend',
      title: `${def.label}: improving`,
      severity: s.abnormal ? 'informational' : 'stable',
      trajectory: 'improving',
      horizon: null,
      evidence: [seriesEvidence(s, 'core')],
      missing: [],
      prevention: {
        ...EMPTY_PREVENTION,
        reviews: ['Continue current plan; reassess if the trend reverses'],
      },
      importance,
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
    Math.abs(s.accelerationPerDay) > def.noise

  const newlyAbnormal = isNewlyAbnormal(s)
  const chronicDrift =
    s.baselineSource === 'chronic' && s.abnormal !== null && !s.chronicStable ? 0.5 : 0
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
  if (s.worsening && s.persistence >= 2 && progressiveRun && rate >= ANALYSIS_CONFIG.rapidRatePerDay) trajectory = 'rapidly_worsening'
  else if (s.worsening && s.persistence >= 2 && progressiveRun) trajectory = 'progressively_worsening'
  else if (s.worsening && (meaningfulRun || s.approachingAbnormal)) trajectory = 'watching'
  else if (!s.worsening && worseningTrend && Math.abs(s.deltaBaseline) >= def.scale * ANALYSIS_CONFIG.watchRunScale) trajectory = 'watching'
  else if (s.abnormal && s.direction === 'flat' && s.points.length > 2) trajectory = 'stable'
  else trajectory = 'minor_change'

  let severity = severityFromScore(importance.total)
  if (trajectory === 'rapidly_worsening') severity = maxSeverity(severity, 'watch')
  // An out-of-range value is never labelled "stable" unless it is a known chronic baseline.
  if (s.abnormal) severity = maxSeverity(severity, 'informational')

  // Time horizon: linear extrapolation toward the concern threshold, only for sustained worsening.
  let projection: Finding['projection'] = null
  let horizon: Horizon | null = null
  if (s.worsening && s.persistence >= 1 && s.projected24h !== null) {
    let threshold: number | null = knowledge?.concernThreshold ?? null
    if (threshold === null && knowledge?.concernThresholdBaselineMultiple) {
      threshold = s.baseline * knowledge.concernThresholdBaselineMultiple
    }
    const hours = threshold !== null ? hoursToThreshold(s, threshold) : null
    // Only extrapolate toward thresholds that lie in the worsening direction
    const validThreshold =
      threshold !== null && isWorseningDirection(def, threshold - s.latest, s.latest) ? threshold : null
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
    trajectory === 'rapidly_worsening' || trajectory === 'progressively_worsening'
      ? `Progressive ${stateLabel}`
      : trajectory === 'watching'
        ? `${def.label}: ${s.direction === 'up' ? 'rising' : 'falling'}`
        : `${def.label}: ${s.abnormal ? `mildly ${side}` : 'within range'}, ${trajectory === 'stable' ? 'stable' : 'minor change'}`

  return {
    ...base,
    kind: 'single_trend',
    title,
    severity,
    trajectory,
    horizon,
    evidence: [seriesEvidence(s, 'core'), ...medEvidence, ...(severity !== 'stable' && severity !== 'informational' ? symptomEvidence : [])],
    missing: knowledge && severity !== 'stable' && severity !== 'informational' ? missingSignals(ctx, knowledge.investigationSignals) : [],
    prevention: severity === 'stable' || severity === 'informational' ? { ...EMPTY_PREVENTION, complicationToAvoid: null } : preventionFrom(knowledge),
    importance,
    suppressedReason: null,
    projection,
  }
}
