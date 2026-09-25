import { describe, expect, it } from 'vitest'
import { NOW, PATIENTS, findPatient } from '../demo-data/patients'
import { assessPatient, assessWard, severityRank } from '../engine'
import type { PatientIntelligence, RecognizedPattern } from '../types'
import { medication, record } from './helpers'

function patient(id: string): PatientIntelligence {
  const rec = findPatient(id)
  if (!rec) throw new Error(`no demo patient ${id}`)
  return assessPatient(rec, { asOf: NOW })
}

function sodiumPattern(pi: PatientIntelligence): RecognizedPattern | undefined {
  return pi.recognizedPatterns.find((p) => p.signals.includes('sodium') && p.kind === 'single_signal_trend')
}

describe('sodium: minor drift vs progressive decline', () => {
  it('133 → 132 does not create a high-priority sodium warning', () => {
    const pi = assessPatient(record('na-mild', { sodium: [[0, 133], [24, 132]] }))
    const p = sodiumPattern(pi)
    expect(p).toBeDefined()
    expect(severityRank(p!.severity)).toBeLessThan(severityRank('watch'))
    expect(p!.interruptiveAlertJustified).toBe(false)
    expect(pi.overallAttentionState).toBe('minor')
    expect(p!.recognition.detectedTrend).toMatch(/minor change|not significantly changing/)
    expect(p!.prevention.statement).toMatch(/No urgent signal/)
  })

  it('138 → 133 → 127 creates a stronger progressive pattern with evidence and prevention', () => {
    const mild = sodiumPattern(assessPatient(record('na-mild', { sodium: [[0, 133], [24, 132]] })))!
    const pi = assessPatient(record('na-prog', { sodium: [[0, 138], [24, 133], [48, 127]] }, [medication('na-prog', 2, 'Hydrochlorothiazide', ['thiazide'])]))
    const p = sodiumPattern(pi)!
    expect(severityRank(p.severity)).toBeGreaterThan(severityRank(mild.severity))
    expect(severityRank(p.severity)).toBeGreaterThanOrEqual(severityRank('concerning'))
    expect(['worsening', 'rapidly_worsening']).toContain(p.trajectory)
    expect(p.interruptiveAlertJustified).toBe(true)
    expect(p.timeHorizon).not.toBeNull()
    // evidence: the series itself and the thiazide
    expect(p.evidence.some((e) => e.kind === 'series' && e.summary.includes('138 → 133 → 127'))).toBe(true)
    expect(p.evidence.some((e) => e.kind === 'medication' && e.classes.includes('thiazide'))).toBe(true)
    // prevention framework
    expect(p.causesToConsider.length).toBeGreaterThan(0)
    expect(p.investigationsToConsider.length).toBeGreaterThan(0)
    expect(p.missingInformation.map((m) => m.signal)).toEqual(expect.arrayContaining(['serum_osmolality', 'urine_osmolality', 'urine_sodium']))
  })

  it('126 → 129 → 132 is recognised as improving, not as hyponatraemia to act on', () => {
    const p = sodiumPattern(assessPatient(record('na-up', { sodium: [[0, 126], [24, 129], [48, 132]] })))!
    expect(p.trajectory).toBe('improving')
    expect(severityRank(p.severity)).toBeLessThan(severityRank('watch'))
    expect(p.interruptiveAlertJustified).toBe(false)
  })
})

describe('demo ward scenarios', () => {
  it('A: mild sodium drift stays minor and non-interruptive', () => {
    const pi = patient('pt-a')
    expect(pi.overallAttentionState).toBe('minor')
    expect(pi.recognizedPatterns.every((p) => !p.interruptiveAlertJustified)).toBe(true)
  })

  it('B: progressive sodium decline is concerning with thiazide context', () => {
    const pi = patient('pt-b')
    const p = sodiumPattern(pi)!
    expect(severityRank(p.severity)).toBeGreaterThanOrEqual(severityRank('concerning'))
    expect(p.evidence.some((e) => e.kind === 'medication' && e.classes.includes('thiazide'))).toBe(true)
    expect(p.confidenceLevel).toBe('high')
  })

  it('C: several modest worsening signals collectively generate an important multisystem pattern', () => {
    const pi = patient('pt-c')
    const multi = pi.recognizedPatterns.find((p) => p.patternId === 'multisystem_deterioration')
    expect(multi).toBeDefined()
    expect(severityRank(multi!.severity)).toBeGreaterThanOrEqual(severityRank('concerning'))
    expect(multi!.clinicalDomain).toBe('multi_system')
    expect(multi!.signals).toEqual(expect.arrayContaining(['oxygen_lpm', 'respiratory_rate', 'systolic_bp', 'creatinine', 'urine_output']))
    // The composite outranks anything a single signal would have produced on its own.
    for (const id of multi!.absorbedPatternIds) expect(pi.recognizedPatterns.find((p) => p.id === id)).toBeUndefined()
    expect(multi!.absorbedPatternIds.length).toBeGreaterThan(0)
    expect(pi.recognizedPatterns[0].id).toBe(multi!.id)
    expect(pi.overallTrajectory).toMatch(/worsening/)
  })

  it('D: improving trend is recognised; no inappropriate red alert', () => {
    const pi = patient('pt-d')
    expect(pi.overallTrajectory).toBe('improving')
    expect(severityRank(pi.overallAttentionState)).toBeLessThan(severityRank('watch'))
    expect(pi.recognizedPatterns.some((p) => p.kind === 'multi_signal_recovery')).toBe(true)
    expect(pi.recognizedPatterns.every((p) => !p.interruptiveAlertJustified)).toBe(true)
  })

  it('E: stable chronic abnormalities are suppressed and explained, not alerted', () => {
    const pi = patient('pt-e')
    expect(pi.overallAttentionState).toBe('stable')
    expect(pi.recognizedPatterns).toHaveLength(0)
    const chronic = pi.suppressedPatterns.filter((p) => p.kind === 'chronic_stable_abnormality')
    expect(chronic.map((p) => p.signals[0])).toEqual(expect.arrayContaining(['creatinine', 'hemoglobin', 'potassium', 'bicarbonate']))
    expect(chronic.every((p) => p.suppressedReason !== null)).toBe(true)
    expect(pi.reassuringSignals.filter((r) => r.status === 'chronic_baseline').length).toBeGreaterThanOrEqual(4)
  })

  it('E: chronic abnormality does not escalate across successive daily reviews', () => {
    const rec = findPatient('pt-e')!
    for (const h of [24, 48, 72]) {
      const asOf = new Date(new Date(rec.admissionTime).getTime() + h * 3_600_000).toISOString()
      const pi = assessPatient(rec, { asOf })
      expect(pi.recognizedPatterns.filter((p) => severityRank(p.severity) >= severityRank('watch')), asOf).toHaveLength(0)
    }
  })

  it('F: renal deterioration combines creatinine, urea and urine output with nephrotoxic context', () => {
    const pi = patient('pt-f')
    const renal = pi.recognizedPatterns.find((p) => p.patternId === 'renal_deterioration')
    expect(renal).toBeDefined()
    expect(severityRank(renal!.severity)).toBeGreaterThanOrEqual(severityRank('concerning'))
    expect(renal!.signals).toEqual(expect.arrayContaining(['creatinine', 'urea', 'urine_output']))
    expect(renal!.evidence.some((e) => e.kind === 'medication' && (e.classes.includes('nsaid') || e.classes.includes('contrast')))).toBe(true)
  })

  it('G: falling haemoglobin with tachycardia on anticoagulation is flagged as possible bleeding', () => {
    const pi = patient('pt-g')
    const bleed = pi.recognizedPatterns.find((p) => p.patternId === 'occult_bleeding')
    expect(bleed).toBeDefined()
    expect(bleed!.interruptiveAlertJustified).toBe(true)
    expect(bleed!.evidence.some((e) => e.kind === 'medication' && e.classes.includes('anticoagulant'))).toBe(true)
  })

  it('ward is ordered by attention state and speaks for 4 of 7 patients', () => {
    const ward = assessWard(PATIENTS, { asOf: NOW })
    const ranks = ward.map((w) => severityRank(w.overallAttentionState))
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
    const interruptive = ward.filter((w) => w.recognizedPatterns.some((p) => p.interruptiveAlertJustified))
    expect(interruptive.map((w) => w.patientId).sort()).toEqual(['pt-b', 'pt-c', 'pt-f', 'pt-g'])
  })
})

describe('output contract invariants (all demo patients, all patterns)', () => {
  const ward = assessWard(PATIENTS, { asOf: NOW })
  const allPatterns = ward.flatMap((w) => [...w.recognizedPatterns, ...w.suppressedPatterns].map((p) => ({ w, p })))

  it('every concerning-or-worse pattern has supporting series evidence', () => {
    for (const { p } of allPatterns) {
      if (severityRank(p.severity) < severityRank('concerning')) continue
      expect(p.evidence.filter((e) => e.kind === 'series').length, p.id).toBeGreaterThan(0)
      expect(p.recognition.supportingObservations.length, p.id).toBeGreaterThan(0)
    }
  })

  it('every prevention output is linked to a recognised pattern', () => {
    for (const { p } of allPatterns) {
      expect(p.prevention.statement.length, p.id).toBeGreaterThan(0)
      // prevention content only appears on patterns that warrant attention
      if (severityRank(p.severity) < severityRank('watch')) {
        expect(p.causesToConsider, p.id).toHaveLength(0)
        expect(p.investigationsToConsider, p.id).toHaveLength(0)
      } else {
        expect(p.causesToConsider.length + p.investigationsToConsider.length + p.prevention.reassessmentPoints.length, p.id).toBeGreaterThan(0)
      }
    }
  })

  it('no pattern claims an unsupported numerical probability', () => {
    const forbidden = /\d+(\.\d+)?\s*%\s*(chance|probability|risk|likelihood)|probability of|likelihood of \d|\b(odds|risk score)\b/i
    for (const { w, p } of allPatterns) {
      const text = JSON.stringify([p.recognition, p.prediction.statement, p.prediction.reasoning, p.prediction.uncertainty, p.prevention, p.title, w.oneLineSummary])
      expect(text, p.id).not.toMatch(forbidden)
      expect(['low', 'moderate', 'high']).toContain(p.confidenceLevel)
    }
  })

  it('no pattern references observations absent from the patient timeline', () => {
    for (const { w, p } of allPatterns) {
      const rec = findPatient(w.patientId)!
      const ids = new Set(rec.timeline.map((o) => o.id))
      for (const e of p.evidence) {
        if (e.kind === 'series') {
          for (const v of e.values) {
            expect(ids.has(v.observationId), `${p.id} ${e.signal}`).toBe(true)
            const source = rec.timeline.find((o) => o.id === v.observationId)!
            expect(source.category !== 'medication' && 'value' in source && source.value === v.value).toBe(true)
          }
        } else {
          expect(ids.has(e.observationId), p.id).toBe(true)
        }
      }
    }
  })

  it('output is JSON-serialisable and free of presentation markup', () => {
    for (const w of ward) {
      const json = JSON.stringify(w)
      expect(json).not.toMatch(/<[a-z]+[\s>]/i)
      expect(JSON.parse(json).patientId).toBe(w.patientId)
    }
  })

  it('interruptive alerts are justified only at concerning severity or above', () => {
    for (const { p } of allPatterns) {
      expect(p.interruptiveAlertJustified, p.id).toBe(severityRank(p.severity) >= severityRank('concerning'))
    }
  })

  it('is deterministic for the same input', () => {
    const a = JSON.stringify(assessWard(PATIENTS, { asOf: NOW }))
    const b = JSON.stringify(assessWard(PATIENTS, { asOf: NOW }))
    expect(a).toBe(b)
  })
})

describe('temporal replay', () => {
  it('patient C is quieter earlier in the admission than at the end', () => {
    const rec = findPatient('pt-c')!
    const early = assessPatient(rec, { asOf: new Date(new Date(rec.admissionTime).getTime() + 24 * 3_600_000).toISOString() })
    const late = assessPatient(rec, { asOf: NOW })
    expect(severityRank(early.overallAttentionState)).toBeLessThan(severityRank(late.overallAttentionState))
  })

  it('changedSinceLastReview lists only signals that moved beyond noise since the review instant', () => {
    const pi = patient('pt-b')
    const na = pi.changedSinceLastReview.find((c) => c.signal === 'sodium')
    expect(na).toBeDefined()
    expect(na!.previous).toBe(133)
    expect(na!.latest).toBe(127)
    expect(na!.partOfPattern).toBe(true)
    expect(pi.changedSinceLastReview.find((c) => c.signal === 'respiratory_rate')).toBeUndefined()
  })
})
