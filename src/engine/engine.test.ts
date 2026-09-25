import { describe, expect, it } from 'vitest'
import { NOW, PATIENTS } from '../data/patients'
import { analyseSeries, assessPatient, assessWard, describeFinding } from './index'
import type { Finding, Observation, Patient } from './types'

const byId = (id: string): Patient => {
  const p = PATIENTS.find((x) => x.id === id)
  if (!p) throw new Error(`missing patient ${id}`)
  return p
}

const active = (findings: Finding[]) =>
  findings.filter((f) => !f.suppressedReason && f.severity !== 'stable' && f.severity !== 'informational')

function sodiumPatient(values: number[]): Patient {
  const admission = '2026-01-01T08:00:00.000Z'
  const observations: Observation[] = values.map((value, i) => ({
    signal: 'sodium',
    time: new Date(new Date(admission).getTime() + i * 24 * 3_600_000).toISOString(),
    value,
  }))
  return {
    id: 'na',
    name: 'Sodium test',
    age: 60,
    sex: 'F',
    bed: '1',
    admissionTime: admission,
    admittingDiagnosis: 'test',
    problems: [],
    baselines: {},
    observations,
    medications: [],
    events: [],
    scenario: 'test',
  }
}

describe('sodium stories are told apart', () => {
  it('138 → 134 → 130 → 126 is a progressive decline that deserves attention', () => {
    const p = sodiumPatient([138, 134, 130, 126])
    const a = assessPatient(p, p.observations[3].time)
    const f = a.findings[0]
    expect(f.trajectory).toBe('progressively_worsening')
    expect(['watch', 'concerning', 'urgent']).toContain(f.severity)
    expect(f.horizon).not.toBeNull()
    expect(describeFinding(f, p).recognition).toContain('138 → 134 → 130 → 126')
  })

  it('133 → 132 is a small change and stays informational', () => {
    const p = sodiumPatient([133, 132])
    const a = assessPatient(p, p.observations[1].time)
    expect(active(a.findings)).toHaveLength(0)
    const f = a.findings[0]
    expect(f.severity).toBe('informational')
    expect(f.trajectory).toBe('minor_change')
    expect(describeFinding(f, p).prediction).toMatch(/No evidence from this trend alone/)
  })

  it('126 → 129 → 132 is recognised as improving', () => {
    const p = sodiumPatient([126, 129, 132])
    const a = assessPatient(p, p.observations[2].time)
    const f = a.findings[0]
    expect(f.trajectory).toBe('improving')
    expect(active(a.findings)).toHaveLength(0)
  })
})

describe('series analytics', () => {
  it('computes persistence, velocity and reversal', () => {
    const p = sodiumPatient([138, 134, 130, 126])
    const s = analyseSeries(p, 'sodium', p.observations[3].time)
    expect(s).not.toBeNull()
    expect(s!.persistence).toBe(3)
    expect(s!.runChange).toBe(12)
    expect(s!.velocityPerDay).toBeCloseTo(-4)
    expect(s!.worsening).toBe(true)

    const r = sodiumPatient([138, 134, 130, 133])
    const rs = analyseSeries(r, 'sodium', r.observations[3].time)
    expect(rs!.reversal).toBe(true)
    expect(rs!.improving).toBe(true)
  })
})

describe('synthetic ward at "now"', () => {
  const ward = assessWard(PATIENTS, NOW)
  const get = (id: string) => {
    const a = ward.find((x) => x.patient.id === id)
    if (!a) throw new Error(id)
    return a
  }

  it('p1: progressive hyponatraemia with thiazide context and missing osmolality', () => {
    const a = get('p1')
    expect(a.overallSeverity).toBe('concerning')
    const f = a.headline!
    expect(f.primarySignal).toBe('sodium')
    expect(f.trajectory).toBe('progressively_worsening')
    expect(f.evidence.some((e) => e.kind === 'medication' && e.medication.name.includes('Hydrochlorothiazide'))).toBe(true)
    expect(f.missing.map((m) => m.label)).toContain('Serum osmolality')
    const text = describeFinding(f, a.patient)
    expect(text.prediction).not.toMatch(/%/)
  })

  it('p2: subtle multi-system deterioration is a single high-concern composite pattern', () => {
    const a = get('p2')
    expect(a.overallSeverity).toBe('concerning')
    const f = a.headline!
    expect(f.kind).toBe('composite_deterioration')
    expect(f.trajectory).toBe('high_concern_pattern')
    expect(f.signals).toEqual(expect.arrayContaining(['systolic_bp', 'urine_output', 'creatinine', 'respiratory_rate', 'oxygen_lpm']))
    // Subsumed composites and absorbed single-signal alerts are not shown separately.
    expect(active(a.findings)).toHaveLength(1)
  })

  it('p3: mildly abnormal trend produces reassurance, not an alert', () => {
    const a = get('p3')
    expect(a.overallSeverity).toBe('informational')
    expect(active(a.findings)).toHaveLength(0)
    const f = a.findings[0]
    expect(f.primarySignal).toBe('sodium')
    expect(f.trajectory).toBe('minor_change')
  })

  it('p4: improving patient is recognised as a multi-signal recovery', () => {
    const a = get('p4')
    expect(active(a.findings)).toHaveLength(0)
    expect(a.headline?.kind).toBe('composite_recovery')
    expect(a.headline?.trajectory).toBe('improving')
  })

  it('p5: stable chronic abnormalities are suppressed and the patient is quiet', () => {
    const a = get('p5')
    expect(a.overallSeverity).toBe('stable')
    expect(a.findings.length).toBeGreaterThanOrEqual(4)
    expect(a.findings.every((f) => f.kind === 'chronic_stable' && f.suppressedReason)).toBe(true)
  })

  it('orders the ward by who needs attention', () => {
    expect(ward.slice(0, 2).map((a) => a.patient.id).sort()).toEqual(['p1', 'p2'])
    expect(ward[ward.length - 1].patient.id).toBe('p5')
  })

  it('never emits percentages or probabilities in physician text', () => {
    for (const a of ward) {
      for (const f of a.findings) {
        const t = describeFinding(f, a.patient)
        for (const s of [t.recognition, t.prediction, t.prevention, ...t.inferred]) {
          expect(s).not.toMatch(/\d\s?%\s*(probability|chance|risk)/i)
          expect(s).not.toMatch(/probability/i)
        }
      }
    }
  })
})

describe('time replay', () => {
  it('p1 escalates as data accrues: watch → concerning', () => {
    const p = byId('p1')
    const day1 = new Date(new Date(p.admissionTime).getTime() + 25 * 3_600_000).toISOString()
    const day2 = new Date(new Date(p.admissionTime).getTime() + 49 * 3_600_000).toISOString()
    expect(assessPatient(p, day1).overallSeverity).toBe('watch')
    expect(assessPatient(p, day2).headline?.trajectory).toBe('progressively_worsening')
    expect(assessPatient(p, NOW).overallSeverity).toBe('concerning')
  })

  it('p2 is quiet on admission and becomes a pattern before any single threshold is crossed', () => {
    const p = byId('p2')
    const h1 = new Date(new Date(p.admissionTime).getTime() + 1 * 3_600_000).toISOString()
    const h25 = new Date(new Date(p.admissionTime).getTime() + 25 * 3_600_000).toISOString()
    expect(active(assessPatient(p, h1).findings)).toHaveLength(0)
    const mid = assessPatient(p, h25)
    expect(mid.headline?.kind).toBe('composite_deterioration')
    expect(mid.headline?.trajectory).toBe('possible_emerging_pattern')
  })
})
