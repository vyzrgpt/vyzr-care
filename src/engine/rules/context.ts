import { ANALYSIS_CONFIG } from '../config'
import { hoursBetween } from '../analytics'
import type {
  ClinicalEvent,
  Evidence,
  MedicationClass,
  MedicationEvent,
  MissingInformation,
  Patient,
  SeriesAnalysis,
  SignalId,
} from '../types'
import { SIGNALS } from '../signals'

export interface RuleContext {
  patient: Patient
  asOf: string
  series: Partial<Record<SignalId, SeriesAnalysis>>
  /** Latest event per medication where the medication has not been stopped. */
  activeMedications: MedicationEvent[]
  /** Medication starts / dose changes within the recent window. */
  recentMedicationChanges: MedicationEvent[]
  recentEvents: ClinicalEvent[]
}

export function buildContext(
  patient: Patient,
  asOf: string,
  series: Partial<Record<SignalId, SeriesAnalysis>>,
): RuleContext {
  const cutoff = new Date(asOf).getTime()
  const latestByName = new Map<string, MedicationEvent>()
  for (const m of patient.medications) {
    if (new Date(m.time).getTime() > cutoff) continue
    const prev = latestByName.get(m.name)
    if (!prev || new Date(m.time) > new Date(prev.time)) latestByName.set(m.name, m)
  }
  const activeMedications = [...latestByName.values()].filter((m) => m.action !== 'stopped')
  const recentMedicationChanges = activeMedications.filter(
    (m) =>
      (m.action === 'started' || m.action === 'dose_changed') &&
      hoursBetween(m.time, asOf) <= ANALYSIS_CONFIG.recentMedicationHours,
  )
  const recentEvents = patient.events.filter(
    (e) => new Date(e.time).getTime() <= cutoff && hoursBetween(e.time, asOf) <= ANALYSIS_CONFIG.recentEventHours,
  )
  return { patient, asOf, series, activeMedications, recentMedicationChanges, recentEvents }
}

export function associatedMedications(ctx: RuleContext, classes: MedicationClass[]): MedicationEvent[] {
  if (classes.length === 0) return []
  return ctx.activeMedications.filter((m) => m.classes.some((c) => classes.includes(c)))
}

export function medicationEvidence(meds: MedicationEvent[], relation: string): Evidence[] {
  return meds.map((medication) => ({ kind: 'medication', medication, relation }))
}

export function eventEvidence(ctx: RuleContext, kinds: ClinicalEvent['kind'][]): Evidence[] {
  return ctx.recentEvents.filter((e) => kinds.includes(e.kind)).map((event) => ({ kind: 'event', event }))
}

export function seriesEvidence(s: SeriesAnalysis, role: 'core' | 'supporting'): Evidence {
  return {
    kind: 'series',
    signal: s.signal.id,
    values: s.points.map((p) => ({ time: p.time, value: p.value })),
    direction: s.direction,
    deltaBaseline: s.deltaBaseline,
    velocityPerDay: s.velocityPerDay,
    abnormal: s.abnormal,
    role,
  }
}

export function missingSignals(ctx: RuleContext, wanted: SignalId[]): MissingInformation[] {
  return wanted
    .filter((id) => !ctx.series[id])
    .map((id) => ({ label: SIGNALS[id].label, reason: 'No result recorded this admission' }))
}

export function isNewlyAbnormal(s: SeriesAnalysis): boolean {
  if (s.abnormal === null) return false
  const def = s.signal
  const baselineAbnormal =
    (def.high !== undefined && s.baseline > def.high) || (def.low !== undefined && s.baseline < def.low)
  return !baselineAbnormal
}
