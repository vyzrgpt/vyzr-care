import { ANALYSIS_CONFIG } from '../config'
import type { NormalizedPatient } from '../normalize'
import type { PreventionTemplate } from '../pattern-library'
import { SIGNALS, formatValue } from '../signals'
import { hoursBetween } from '../trends'
import type {
  ClinicalDomain,
  ConfidenceLevel,
  EventCategory,
  EventObservation,
  Evidence,
  ImportanceBreakdown,
  MedicationClass,
  MedicationObservation,
  MissingInformation,
  PatternKind,
  Prediction,
  SeriesAnalysis,
  Severity,
  SignalId,
  Trajectory,
  TimeHorizon,
} from '../types'

/** Everything a pattern rule may look at. */
export interface RuleContext {
  patient: NormalizedPatient
  series: Partial<Record<SignalId, SeriesAnalysis>>
  /** Latest event per medication where the medication has not been stopped. */
  activeMedications: MedicationObservation[]
  /** Medication starts / dose changes within the recent window. */
  recentMedicationChanges: MedicationObservation[]
  recentEvents: EventObservation[]
}

/**
 * Structured output of a pattern rule before any physician-facing language is attached.
 * `explanations.ts` turns this into a `RecognizedPattern`; it must not add facts.
 */
export interface RawPattern {
  id: string
  patternId: string
  kind: PatternKind
  domain: ClinicalDomain
  title: string
  severity: Severity
  trajectory: Trajectory
  /** Short machine-independent description of the detected trend, e.g. "progressive decline". */
  detectedTrend: string
  confidence: ConfidenceLevel
  horizon: TimeHorizon | null
  signals: SignalId[]
  primarySignal: SignalId | null
  evidence: Evidence[]
  missing: MissingInformation[]
  prevention: PreventionTemplate
  importance: ImportanceBreakdown
  suppressedReason: string | null
  projection: Prediction['projection']
  /** Series that contributed, primary first. */
  series: SeriesAnalysis[]
}

export function buildContext(patient: NormalizedPatient, series: Partial<Record<SignalId, SeriesAnalysis>>): RuleContext {
  const latestByName = new Map<string, MedicationObservation>()
  for (const m of patient.medications) {
    const prev = latestByName.get(m.name)
    if (!prev || new Date(m.time) > new Date(prev.time)) latestByName.set(m.name, m)
  }
  const activeMedications = [...latestByName.values()].filter((m) => m.action !== 'stopped')
  const recentMedicationChanges = activeMedications.filter(
    (m) =>
      (m.action === 'started' || m.action === 'dose_changed') &&
      hoursBetween(m.time, patient.asOf) <= ANALYSIS_CONFIG.recentMedicationHours,
  )
  const recentEvents = patient.events.filter((e) => hoursBetween(e.time, patient.asOf) <= ANALYSIS_CONFIG.recentEventHours)
  return { patient, series, activeMedications, recentMedicationChanges, recentEvents }
}

export function associatedMedications(ctx: RuleContext, classes: MedicationClass[]): MedicationObservation[] {
  if (classes.length === 0) return []
  return ctx.activeMedications.filter((m) => m.classes.some((c) => classes.includes(c)))
}

export function medicationEvidence(meds: MedicationObservation[], relation: string): Evidence[] {
  return meds.map((m) => ({
    kind: 'medication',
    observationId: m.id,
    name: m.name,
    classes: m.classes,
    action: m.action,
    time: m.time,
    relation,
    detail: m.detail,
  }))
}

export function eventEvidence(ctx: RuleContext, categories: EventCategory[]): Evidence[] {
  return ctx.recentEvents
    .filter((e) => categories.includes(e.category))
    .map((e) => ({ kind: 'event', observationId: e.id, category: e.category, time: e.time, description: e.description }))
}

/** "138 → 134 → 130 → 127 mmol/L" (first value kept, middle elided beyond `maxPoints`). */
export function seriesSummary(s: SeriesAnalysis, maxPoints = 6): string {
  const pts = s.points.length > maxPoints ? [s.points[0], ...s.points.slice(-(maxPoints - 1))] : s.points
  const values = pts.map((p) => formatValue(s.signal.id, p.value))
  const joined = s.points.length > maxPoints ? `${values[0]} → … → ${values.slice(1).join(' → ')}` : values.join(' → ')
  return `${joined}${s.signal.unit ? ` ${s.signal.unit}` : ''}`
}

export function seriesEvidence(s: SeriesAnalysis, role: 'core' | 'supporting'): Evidence {
  return {
    kind: 'series',
    signal: s.signal.id,
    label: s.signal.label,
    unit: s.signal.unit,
    role,
    values: s.points,
    direction: s.direction,
    deltaPrevious: s.deltaPrevious,
    deltaBaseline: s.deltaBaseline,
    velocityPerDay: s.velocityPerDay,
    abnormal: s.abnormal,
    summary: seriesSummary(s),
  }
}

export function missingSignals(ctx: RuleContext, wanted: SignalId[]): MissingInformation[] {
  return wanted
    .filter((id) => !ctx.series[id])
    .map((id) => ({ label: SIGNALS[id].label, reason: 'No result recorded this admission', signal: id }))
}

export function isNewlyAbnormal(s: SeriesAnalysis): boolean {
  if (s.abnormal === null) return false
  const def = s.signal
  const baselineAbnormal =
    (def.high !== undefined && s.baseline > def.high) || (def.low !== undefined && s.baseline < def.low)
  return !baselineAbnormal
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  const order: Severity[] = ['stable', 'minor', 'watch', 'concerning', 'urgent']
  return order.indexOf(a) >= order.indexOf(b) ? a : b
}

/**
 * Semantic confidence: how much longitudinal support the pattern has.
 * Never a probability — it describes data sufficiency, not outcome likelihood.
 */
export function confidenceFromSeries(series: SeriesAnalysis[]): ConfidenceLevel {
  const maxPersistence = Math.max(...series.map((s) => s.persistence))
  const maxPoints = Math.max(...series.map((s) => s.points.length))
  if (maxPersistence >= 2 && maxPoints >= 3 && series.length >= 1) return 'high'
  if (maxPersistence >= 1 && maxPoints >= 2) return 'moderate'
  return 'low'
}
