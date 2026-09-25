/**
 * Multi-signal rules: concordant deterioration across related signals (specs in the pattern
 * library) and multi-signal recovery. A composite scores through *agreement* — many modest
 * moves in the same clinical direction — rather than through any single extreme value.
 */
import { ANALYSIS_CONFIG } from '../config'
import type { CompositeSpec } from '../pattern-library'
import { cap, scoreImportance, severityFromScore } from '../scoring'
import { hasImprovingTrend, hasMeaningfulWorsening, hasWorseningTrend } from '../trends'
import type { ClinicalDomain, Evidence, ImportanceComponents, SeriesAnalysis, SignalId, Trajectory } from '../types'
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

function worseningSeries(ctx: RuleContext, ids: SignalId[]): SeriesAnalysis[] {
  return ids
    .map((id) => ctx.series[id])
    .filter((s): s is SeriesAnalysis => !!s && !s.chronicStable && hasMeaningfulWorsening(s))
}

function distinctDomains(series: SeriesAnalysis[]): Set<ClinicalDomain> {
  return new Set(series.map((s) => s.signal.domain))
}

export function evaluateComposite(ctx: RuleContext, spec: CompositeSpec): RawPattern | null {
  const coreHits = worseningSeries(ctx, spec.core)
  if (coreHits.length < spec.minCore) return null
  if (spec.minDomains !== undefined && distinctDomains(coreHits).size < spec.minDomains) return null
  const meds = associatedMedications(ctx, spec.contextMedications)
  if (spec.requireContextMedication && meds.length === 0) return null

  const supportingHits = worseningSeries(ctx, spec.supporting)
  const allHits = [...coreHits, ...supportingHits]

  const rates = allHits.map((s) => (s.velocityPerDay !== null ? Math.abs(s.velocityPerDay) / s.signal.scale : 0))
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const components: Partial<ImportanceComponents> = {
    magnitude: cap(mean(allHits.map((s) => s.magnitude))),
    rateOfChange: cap(mean(rates)),
    persistence: Math.min(3, Math.max(...allHits.map((s) => s.persistence))),
    crossVariableAgreement: coreHits.length + supportingHits.length,
    context: Math.min(2, meds.length),
    novelty: Math.min(1.5, allHits.filter(isNewlyAbnormal).length + allHits.filter((s) => s.approachingAbnormal).length * 0.5),
  }
  const importance = scoreImportance(components)

  const sustained = coreHits.filter((s) => s.persistence >= 2).length
  const strong =
    (coreHits.length >= spec.minCore + 1 && sustained >= 2) ||
    (coreHits.length === spec.core.length && supportingHits.length >= 1) ||
    coreHits.length >= spec.minCore + 2
  const rapid = strong && rates.filter((r) => r >= ANALYSIS_CONFIG.rapidRatePerDay).length >= 2
  const trajectory: Trajectory = rapid ? 'rapidly_worsening' : 'worsening'
  const detectedTrend = strong
    ? `concordant worsening across ${coreHits.length} core signals in ${distinctDomains(coreHits).size} domain(s)`
    : `possible emerging pattern: ${coreHits.length} core signals worsening together`

  let severity = severityFromScore(importance.total)
  severity = maxSeverity(severity, strong ? 'concerning' : 'watch')
  if (rapid) severity = maxSeverity(severity, 'urgent')

  const evidence: Evidence[] = [
    ...coreHits.map((s) => seriesEvidence(s, 'core')),
    ...supportingHits.map((s) => seriesEvidence(s, 'supporting')),
    ...medicationEvidence(meds, spec.medicationRelation),
    ...eventEvidence(ctx, ['symptom', 'nursing', 'microbiology', 'imaging']),
  ]

  return {
    id: `${ctx.patient.record.patientId}:${spec.id}`,
    patternId: spec.id,
    kind: 'multi_signal_deterioration',
    title: spec.title,
    domain: spec.domain,
    severity,
    trajectory,
    detectedTrend,
    // An emerging (not yet strong) pattern is never reported with high confidence.
    confidence: strong ? confidenceFromSeries(coreHits) : confidenceFromSeries(coreHits) === 'low' ? 'low' : 'moderate',
    horizon: strong ? spec.horizonHighConcern : spec.horizonEmerging,
    signals: allHits.map((s) => s.signal.id),
    primarySignal: coreHits[0].signal.id,
    evidence,
    missing: missingSignals(ctx, spec.investigationSignals),
    prevention: spec.prevention,
    importance,
    suppressedReason: null,
    projection: null,
    series: allHits,
  }
}

export const RECOVERY_RULE_ID = 'multi_signal_recovery'

/** Several previously abnormal signals improving with nothing worsening. */
export function evaluateRecovery(ctx: RuleContext): RawPattern | null {
  const all = Object.values(ctx.series).filter((s): s is SeriesAnalysis => !!s)
  const worsening = all.filter((s) => !s.chronicStable && hasWorseningTrend(s))
  const improving = all.filter((s) => !s.chronicStable && hasImprovingTrend(s) && !hasWorseningTrend(s))
  if (improving.length < ANALYSIS_CONFIG.recoveryMinSignals || worsening.length > 0) return null

  const treatments = ctx.activeMedications.filter((m) => m.action === 'started')
  const importance = scoreImportance({
    magnitude: cap(Math.max(...improving.map((s) => s.magnitude))),
    treatmentResponse: Math.min(3, improving.length),
  })
  return {
    id: `${ctx.patient.record.patientId}:${RECOVERY_RULE_ID}`,
    patternId: RECOVERY_RULE_ID,
    kind: 'multi_signal_recovery',
    title: 'Improving across multiple signals',
    domain: 'multi_system',
    severity: 'minor',
    trajectory: 'improving',
    detectedTrend: `${improving.length} previously abnormal signals improving concurrently, none worsening`,
    confidence: confidenceFromSeries(improving),
    horizon: null,
    signals: improving.map((s) => s.signal.id),
    primarySignal: improving[0].signal.id,
    evidence: [...improving.map((s) => seriesEvidence(s, 'core')), ...medicationEvidence(treatments, 'treatment in progress')],
    missing: [],
    prevention: {
      causes: [],
      investigations: [],
      reviews: ['Continue current plan', 'Consider de-escalation (oxygen, monitoring frequency) as appropriate', 'Reassess if any signal reverses'],
      complicationToAvoid: null,
    },
    importance,
    suppressedReason: null,
    projection: null,
    series: improving,
  }
}
