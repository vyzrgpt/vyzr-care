/**
 * Normalisation: turns a flat, unordered `PatientRecord.timeline` into the per-signal
 * series, medication events and clinical events the analysis operates on. Everything
 * after `asOf` is excluded so that the same record can be assessed at any point in time.
 */
import { SIGNALS, toRegistryUnit } from './signals'
import type {
  ClinicalObservation,
  EventObservation,
  MedicationObservation,
  NumericObservation,
  PatientRecord,
  SeriesPoint,
  SignalId,
} from './types'

export interface NormalizedPatient {
  record: PatientRecord
  asOf: string
  /** Time-ordered numeric points per signal, up to and including `asOf`. */
  series: Partial<Record<SignalId, SeriesPoint[]>>
  /** Time-ordered medication observations up to `asOf`. */
  medications: MedicationObservation[]
  /** Time-ordered event observations up to `asOf`. */
  events: EventObservation[]
  /** Observations that could not be analysed, with the reason. */
  skipped: SkippedObservation[]
}

export interface SkippedObservation {
  observation: ClinicalObservation
  reason: 'unknown_signal' | 'non_finite_value' | 'unsupported_unit'
}

export function isNumeric(o: ClinicalObservation): o is NumericObservation {
  return o.category === 'lab' || o.category === 'vital' || o.category === 'oxygen' || o.category === 'intake_output'
}

export function isMedication(o: ClinicalObservation): o is MedicationObservation {
  return o.category === 'medication'
}

export function isEvent(o: ClinicalObservation): o is EventObservation {
  return !isNumeric(o) && !isMedication(o)
}

function ms(time: string): number {
  return new Date(time).getTime()
}

export function normalizePatient(record: PatientRecord, asOf: string): NormalizedPatient {
  const cutoff = ms(asOf)
  const ordered = [...record.timeline]
    .filter((o) => ms(o.time) <= cutoff)
    .sort((a, b) => ms(a.time) - ms(b.time))

  const series: Partial<Record<SignalId, SeriesPoint[]>> = {}
  const medications: MedicationObservation[] = []
  const events: EventObservation[] = []
  const skipped: SkippedObservation[] = []

  for (const o of ordered) {
    if (isNumeric(o)) {
      if (!(o.code in SIGNALS)) {
        skipped.push({ observation: o, reason: 'unknown_signal' })
        continue
      }
      if (!Number.isFinite(o.value)) {
        skipped.push({ observation: o, reason: 'non_finite_value' })
        continue
      }
      const value = toRegistryUnit(o.code, o.value, o.unit)
      if (value === null) {
        skipped.push({ observation: o, reason: 'unsupported_unit' })
        continue
      }
      const list = series[o.code] ?? (series[o.code] = [])
      const referenceRange = value === o.value ? o.referenceRange : undefined
      list.push({ observationId: o.id, time: o.time, value, ...(referenceRange ? { referenceRange } : {}) })
    } else if (isMedication(o)) {
      medications.push(o)
    } else {
      events.push(o)
    }
  }
  return { record, asOf, series, medications, events, skipped }
}

/** Latest observation time across a set of records (useful as a default `asOf`). */
export function latestObservationTime(records: PatientRecord[]): string {
  let max = 0
  for (const r of records) for (const o of r.timeline) max = Math.max(max, ms(o.time))
  return new Date(max).toISOString()
}
