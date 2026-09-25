import { SIGNALS } from '../signals'
import type { ClinicalObservation, MedicationClass, NumericObservation, PatientRecord, SignalId } from '../types'

export const T0 = '2026-01-01T08:00:00.000Z'

export function at(hours: number): string {
  return new Date(new Date(T0).getTime() + hours * 3_600_000).toISOString()
}

let counter = 0

export function numeric(patientId: string, code: SignalId, hours: number, value: number): NumericObservation {
  const def = SIGNALS[code]
  counter += 1
  return { id: `${patientId}-${code}-${counter}`, patientId, time: at(hours), category: def.category, code, value, unit: def.unit }
}

export function medication(patientId: string, hours: number, name: string, classes: MedicationClass[], action: 'started' | 'continued' = 'started'): ClinicalObservation {
  counter += 1
  return { id: `${patientId}-med-${counter}`, patientId, time: at(hours), category: 'medication', name, classes, action }
}

/** Minimal record: one or more numeric series given as `[hours, value][]` per signal. */
export function record(
  patientId: string,
  series: Partial<Record<SignalId, [number, number][]>>,
  extra: ClinicalObservation[] = [],
  knownBaselines: PatientRecord['knownBaselines'] = {},
): PatientRecord {
  const timeline: ClinicalObservation[] = [...extra]
  for (const [code, points] of Object.entries(series) as [SignalId, [number, number][]][]) {
    for (const [h, v] of points) timeline.push(numeric(patientId, code, h, v))
  }
  return {
    patientId,
    name: `Test ${patientId}`,
    age: 60,
    sex: 'F',
    location: 'Test',
    admissionTime: T0,
    admittingDiagnosis: 'Test',
    problems: [],
    knownBaselines,
    timeline,
  }
}
