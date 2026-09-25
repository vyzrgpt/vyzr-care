/**
 * Engine entry point.
 *
 *   OBSERVATIONS → normalize → trends (per signal) → patterns (single + multi-signal)
 *   → scoring / suppression → explanations → PatientIntelligence
 *
 * Deterministic and pure: the same record and `asOf` always produce the same output.
 */
import { ANALYSIS_CONFIG } from './config'
import { explainPattern } from './explanations'
import { latestObservationTime, normalizePatient } from './normalize'
import { COMPOSITE_SPECS } from './pattern-library'
import { evaluateComposite, evaluateRecovery } from './patterns/composite'
import { buildContext, type RawPattern } from './patterns/context'
import { evaluateTrend } from './patterns/trend'
import { SIGNAL_IDS } from './signals'
import { analyseSeries, exceedsNoise, hasImprovingTrend, hasWorseningTrend } from './trends'
import { SEVERITY_ORDER } from './types'
import type {
  ChangedSignal,
  OverallTrajectory,
  PatientIntelligence,
  PatientRecord,
  ReassuringSignal,
  RecognizedPattern,
  SeriesAnalysis,
  Severity,
  SignalId,
} from './types'

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s)
}

export interface AssessOptions {
  /** Assessment instant (ISO). Defaults to the latest observation in the record. */
  asOf?: string
  /**
   * Start of the "since last review" window (ISO). Defaults to 24 h before `asOf`.
   * Signals whose latest value differs from the last value before this instant are listed.
   */
  lastReviewAt?: string
  /** Value stamped into `generatedAt`; defaults to `asOf` so outputs are reproducible. */
  generatedAt?: string
}

function latestTimeIn(record: PatientRecord): string {
  let max = 0
  for (const o of record.timeline) max = Math.max(max, new Date(o.time).getTime())
  return new Date(max).toISOString()
}

const SPEC_BY_ID = new Map(COMPOSITE_SPECS.map((spec) => [spec.id, spec]))

function subsumeComposites(all: RawPattern[]): RawPattern[] {
  // A composite adds no new information when a broader composite of equal or higher severity
  // covers every one of its signals, or declares that it may subsume it and covers most of
  // them. Otherwise the narrower pattern's unmatched signal changes the interpretation and it
  // is kept.
  const ranked = [...all].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.signals.length - a.signals.length || b.importance.total - a.importance.total)
  const kept: RawPattern[] = []
  for (const c of ranked) {
    const covered = kept.some((other) => {
      if (other.signals.length < c.signals.length) return false
      const overlap = c.signals.filter((id) => other.signals.includes(id)).length / c.signals.length
      if (overlap === 1) return true
      const declared = SPEC_BY_ID.get(other.patternId)?.subsumes?.includes(c.patternId) ?? false
      return declared && overlap >= ANALYSIS_CONFIG.compositeOverlapToSubsume
    })
    if (!covered) kept.push(c)
  }
  return kept
}

function changedSince(series: Partial<Record<SignalId, SeriesAnalysis>>, since: string, patterned: Set<SignalId>): ChangedSignal[] {
  const sinceMs = new Date(since).getTime()
  const out: ChangedSignal[] = []
  for (const id of SIGNAL_IDS) {
    const s = series[id]
    if (!s) continue
    const before = s.points.filter((p) => new Date(p.time).getTime() <= sinceMs)
    const after = s.points.filter((p) => new Date(p.time).getTime() > sinceMs)
    if (before.length === 0 || after.length === 0) continue
    const previous = before[before.length - 1].value
    const delta = Number((s.latest - previous).toFixed(s.signal.decimals))
    if (!exceedsNoise(s.signal, delta)) continue
    out.push({
      signal: id,
      label: s.signal.label,
      unit: s.signal.unit,
      previous,
      latest: s.latest,
      delta,
      direction: delta > 0 ? 'up' : 'down',
      time: s.latestTime,
      partOfPattern: patterned.has(id),
    })
  }
  return out.sort((a, b) => Number(b.partOfPattern) - Number(a.partOfPattern) || Math.abs(b.delta / b.latest) - Math.abs(a.delta / a.latest))
}

function reassuringSignals(series: Partial<Record<SignalId, SeriesAnalysis>>, quietIds: SignalId[], patterns: RecognizedPattern[]): ReassuringSignal[] {
  const out: ReassuringSignal[] = []
  for (const id of quietIds) {
    const s = series[id]
    // Signals without any reference bound (diagnostic-only, e.g. urine studies) have no "range" to be within.
    if (!s || (s.signal.low === undefined && s.signal.high === undefined)) continue
    out.push({ signal: id, label: s.signal.label, latest: s.latest, unit: s.signal.unit, status: 'within_range', reason: 'Within range; no movement beyond measurement noise.' })
  }
  for (const p of patterns) {
    const s = series[p.signals[0]]
    if (!s || p.signals.length !== 1) continue
    if (p.kind === 'chronic_stable_abnormality') {
      out.push({ signal: s.signal.id, label: s.signal.label, latest: s.latest, unit: s.signal.unit, status: 'chronic_baseline', reason: p.suppressedReason ?? 'At known chronic baseline.' })
    } else if (p.trajectory === 'improving' && (p.severity === 'stable' || p.severity === 'minor')) {
      out.push({ signal: s.signal.id, label: s.signal.label, latest: s.latest, unit: s.signal.unit, status: 'improving', reason: 'Improving; no escalation signal.' })
    } else if (p.severity === 'minor' && (p.trajectory === 'stable' || p.trajectory === 'minor_change')) {
      out.push({
        signal: s.signal.id,
        label: s.signal.label,
        latest: s.latest,
        unit: s.signal.unit,
        status: 'abnormal_but_stable',
        reason: p.trajectory === 'stable' ? 'Abnormal but not significantly changing.' : 'Minor change; no escalation signal.',
      })
    }
  }
  return out
}

function overallTrajectory(active: RecognizedPattern[], series: Partial<Record<SignalId, SeriesAnalysis>>): OverallTrajectory {
  const deteriorating = active.filter((p) => (p.trajectory === 'worsening' || p.trajectory === 'rapidly_worsening') && severityRank(p.severity) >= severityRank('watch'))
  if (deteriorating.some((p) => p.trajectory === 'rapidly_worsening' && severityRank(p.severity) >= severityRank('concerning'))) return 'rapidly_worsening'
  if (deteriorating.length) return 'worsening'
  const all = Object.values(series).filter((s): s is SeriesAnalysis => !!s && !s.chronicStable)
  const improving = all.filter((s) => hasImprovingTrend(s) && !hasWorseningTrend(s)).length
  const worsening = all.filter((s) => hasWorseningTrend(s)).length
  if (improving >= 2 && worsening === 0) return 'improving'
  if (active.some((p) => p.trajectory === 'improving') && worsening === 0) return 'improving'
  return 'stable'
}

function oneLineSummary(active: RecognizedPattern[], trajectory: OverallTrajectory, attention: Severity, reassuring: ReassuringSignal[]): string {
  const lead = active.find((p) => severityRank(p.severity) >= severityRank('watch'))
  if (lead) return lead.recognition.headline
  if (trajectory === 'improving') {
    const rec = active.find((p) => p.kind === 'multi_signal_recovery') ?? active.find((p) => p.trajectory === 'improving')
    return rec ? rec.recognition.headline : 'Improving; no active concerns.'
  }
  const chronic = reassuring.filter((r) => r.status === 'chronic_baseline')
  if (attention === 'minor') {
    const minor = active.find((p) => p.severity === 'minor')
    return minor ? `${minor.recognition.headline} No escalation signal.` : 'Minor changes only; no escalation signal.'
  }
  if (chronic.length) return `No new patterns. ${chronic.length} chronic abnormalit${chronic.length === 1 ? 'y' : 'ies'} at known baseline; all other observed signals within range.`
  return 'No active patterns. All observed signals within range or at baseline.'
}

export function assessPatient(record: PatientRecord, options: AssessOptions = {}): PatientIntelligence {
  const asOf = options.asOf ?? latestTimeIn(record)
  const lastReviewAt = options.lastReviewAt ?? new Date(new Date(asOf).getTime() - 24 * 3_600_000).toISOString()
  const np = normalizePatient(record, asOf)

  const series: Partial<Record<SignalId, SeriesAnalysis>> = {}
  for (const id of SIGNAL_IDS) {
    const s = analyseSeries(np, id)
    if (s) series[id] = s
  }
  const ctx = buildContext(np, series)

  const single: RawPattern[] = []
  const quietIds: SignalId[] = []
  for (const id of SIGNAL_IDS) {
    const s = series[id]
    if (!s) continue
    const p = evaluateTrend(ctx, s)
    if (p) single.push(p)
    else quietIds.push(id)
  }

  const composites = subsumeComposites(COMPOSITE_SPECS.map((spec) => evaluateComposite(ctx, spec)).filter((p): p is RawPattern => p !== null))
  const recovery = evaluateRecovery(ctx)
  if (recovery) composites.push(recovery)

  // Fold single-signal patterns into a composite that already explains them.
  const absorbedBy = new Map<string, string[]>()
  const absorbed = new Set<string>()
  for (const c of composites) {
    for (const p of single) {
      if (p.primarySignal && c.signals.includes(p.primarySignal) && severityRank(p.severity) <= severityRank(c.severity)) {
        absorbed.add(p.id)
        absorbedBy.set(c.id, [...(absorbedBy.get(c.id) ?? []), p.id])
      }
    }
  }

  const explained = [...composites, ...single.filter((p) => !absorbed.has(p.id))]
    .map((p) => explainPattern(p, record, absorbedBy.get(p.id) ?? []))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.importance.total - a.importance.total)

  const recognizedPatterns = explained.filter((p) => !p.suppressedReason)
  const suppressedPatterns = explained.filter((p) => !!p.suppressedReason)

  const overallAttentionState = recognizedPatterns.reduce<Severity>((acc, p) => (severityRank(p.severity) > severityRank(acc) ? p.severity : acc), 'stable')
  const trajectory = overallTrajectory(recognizedPatterns, series)
  const reassuring = reassuringSignals(series, quietIds, explained)
  const patterned = new Set<SignalId>(recognizedPatterns.flatMap((p) => p.signals))

  return {
    patientId: record.patientId,
    generatedAt: options.generatedAt ?? asOf,
    asOf,
    overallTrajectory: trajectory,
    overallAttentionState,
    oneLineSummary: oneLineSummary(recognizedPatterns, trajectory, overallAttentionState, reassuring),
    changedSinceLastReview: changedSince(series, lastReviewAt, patterned),
    recognizedPatterns,
    reassuringSignals: reassuring,
    suppressedPatterns,
    series,
  }
}

/**
 * Assesses every patient at one shared instant so the ward ranking compares like with like.
 * Defaults to the latest observation across the whole ward when `asOf` is not supplied.
 */
export function assessWard(records: PatientRecord[], options: AssessOptions = {}): PatientIntelligence[] {
  const asOf = options.asOf ?? latestObservationTime(records)
  return records
    .map((r) => assessPatient(r, { ...options, asOf }))
    .sort((a, b) => severityRank(b.overallAttentionState) - severityRank(a.overallAttentionState))
}
