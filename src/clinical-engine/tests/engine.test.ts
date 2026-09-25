import { describe, expect, it } from 'vitest'
import { NOW, PATIENTS, findPatient } from '../demo-data/patients'
import { assessPatient, assessWard, severityRank } from '../engine'
import { normalizePatient } from '../normalize'
import { hasWorseningTrend } from '../trends'
import type { PatientIntelligence, RecognizedPattern } from '../types'
import { at, medication, numeric, record } from './helpers'

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

describe('temporal edge cases', () => {
  it('a meaningful rebound after a decline is improving, not still worsening from baseline', () => {
    const p = sodiumPattern(assessPatient(record('na-rebound', { sodium: [[0, 138], [24, 127], [48, 130]] })))!
    expect(p.trajectory).toBe('improving')
    expect(p.interruptiveAlertJustified).toBe(false)
  })

  it('crossing to the opposite abnormal side is worsening, not improving', () => {
    const p = sodiumPattern(assessPatient(record('na-cross', { sodium: [[0, 125], [24, 150]] })))!
    expect(p.trajectory).not.toBe('improving')
    expect(p.severity).not.toBe('stable')
  })

  it('a worsening value already past its concern threshold is not told "no threshold projected"', () => {
    const p = sodiumPattern(assessPatient(record('na-deep', { sodium: [[0, 130], [24, 123], [48, 120]] })))!
    expect(p.prediction.statement).not.toMatch(/No concern threshold is projected/)
    expect(p.prediction.statement).toMatch(/already beyond/)
    expect(p.prediction.projection?.hoursToThreshold).toBe(0)
  })

  it('unbounded diagnostic signals (urine osmolality) never form a deterioration pattern on their own', () => {
    const pi = assessPatient(record('uosm', { urine_osmolality: [[0, 300], [24, 500], [48, 700]] }))
    expect(pi.recognizedPatterns).toHaveLength(0)
    expect(pi.overallAttentionState).toBe('stable')
  })
})

describe('input units and reference ranges', () => {
  it('converts known alternative units and skips unsupported ones instead of misreading them', () => {
    const rec = record('units', {})
    const glu = numeric('units', 'glucose', 0, 6)
    rec.timeline.push({ ...glu, unit: 'mmol/L' })
    const cr = numeric('units', 'creatinine', 0, 1.0)
    rec.timeline.push({ ...cr, unit: 'mg/L' })
    const pi = assessPatient(rec)
    expect(pi.series.glucose?.latest).toBeCloseTo(108.1, 1)
    expect(pi.series.glucose?.abnormal).toBeNull()
    expect(pi.series.creatinine).toBeUndefined()
    expect(pi.recognizedPatterns.some((p) => p.signals.includes('glucose') && p.severity !== 'stable')).toBe(false)
  })

  it('a source-supplied reference range takes precedence over the registry range', () => {
    const rec = record('range', {})
    const na = numeric('range', 'sodium', 0, 132)
    rec.timeline.push({ ...na, referenceRange: { low: 130, high: 145 } })
    const pi = assessPatient(rec)
    expect(pi.series.sodium?.abnormal).toBeNull()
    expect(pi.series.sodium?.signal.low).toBe(130)
  })

  it('converts a source reference range into the registry unit, including for zero-valued measurements', () => {
    const rec = record('range-units', {})
    const glu = numeric('range-units', 'glucose', 0, 0)
    rec.timeline.push({ ...glu, unit: 'mmol/L', referenceRange: { low: 4, high: 8 } })
    const pi = assessPatient(rec)
    expect(pi.series.glucose?.latest).toBe(0)
    expect(pi.series.glucose?.signal.low).toBeCloseTo(72.1, 1)
    expect(pi.series.glucose?.signal.high).toBeCloseTo(144.1, 1)
    expect(pi.series.glucose?.abnormal).toBe('low')
  })

  it('observations carrying another patientId are skipped, never analysed', () => {
    const rec = record('own', { sodium: [[0, 138], [24, 137]] })
    rec.timeline.push(
      numeric('other', 'sodium', 48, 120),
      medication('other', 30, 'Hydrochlorothiazide', ['thiazide']),
      { id: 'other-ev', patientId: 'other', time: at(30), category: 'symptom', description: 'Confusion' },
    )
    const np = normalizePatient(rec, at(48))
    expect(np.skipped.filter((s) => s.reason === 'patient_mismatch')).toHaveLength(3)
    expect(np.series.sodium?.map((p) => p.value)).toEqual([138, 137])
    expect(np.medications).toHaveLength(0)
    expect(np.events).toHaveLength(0)
    const pi = assessPatient(rec, { asOf: at(48) })
    expect(pi.series.sodium?.latest).toBe(137)
    expect(pi.recognizedPatterns.some((p) => p.signals.includes('sodium') && p.severity !== 'stable')).toBe(false)
    expect(pi.recognizedPatterns.flatMap((p) => p.evidence).some((e) => e.kind !== 'series')).toBe(false)
  })
})

describe('composite subsumption', () => {
  it('occult bleeding is kept alongside haemodynamic deterioration when haemoglobin is falling', () => {
    const rec = record(
      'bleed',
      {
        hemoglobin: [[0, 12.6], [24, 11.2], [48, 10.3], [72, 9.1]],
        heart_rate: [[0, 76], [24, 84], [48, 92], [72, 104]],
        systolic_bp: [[0, 136], [24, 128], [48, 122], [72, 108]],
        urine_output: [[0, 70], [24, 60], [48, 55], [72, 45]],
        // extra haemodynamic support so that hemodynamic_deterioration has at least as many signals
        lactate: [[0, 1.0], [24, 1.4], [48, 2.1], [72, 2.8]],
        respiratory_rate: [[0, 14], [24, 16], [48, 19], [72, 22]],
        temperature: [[0, 36.8], [24, 37.2], [48, 37.7], [72, 38.1]],
      },
      [medication('bleed', -12, 'Apixaban 5 mg BD', ['anticoagulant'], 'continued')],
    )
    const pi = assessPatient(rec, { asOf: at(72) })
    const bleeding = pi.recognizedPatterns.find((p) => p.patternId === 'occult_bleeding')
    expect(bleeding).toBeDefined()
    expect(bleeding!.signals).toContain('hemoglobin')
    // haemodynamic deterioration alone does not explain the haemoglobin fall, so it may not hide bleeding
    const hemo = pi.recognizedPatterns.find((p) => p.patternId === 'hemodynamic_deterioration')
    if (hemo) expect(hemo.signals).not.toContain('hemoglobin')
  })

  it('a narrower composite fully covered by a broader one of equal severity is still folded in', () => {
    const c = patient('pt-c')
    expect(c.recognizedPatterns.some((p) => p.patternId === 'multisystem_deterioration')).toBe(true)
    expect(c.recognizedPatterns.some((p) => p.patternId === 'hemodynamic_deterioration')).toBe(false)
    expect(c.recognizedPatterns.some((p) => p.patternId === 'respiratory_deterioration')).toBe(false)
  })
})

describe('plateaus and freshness', () => {
  it('a deterioration that has plateaued is no longer an active worsening trend', () => {
    // fell early, then flat for three intervals: still displaced from admission baseline, no longer moving
    const rec = record('plateau', {
      systolic_bp: [[0, 130], [12, 112], [24, 104], [36, 104], [48, 105], [60, 104]],
      heart_rate: [[0, 72], [12, 88], [24, 100], [36, 100], [48, 99], [60, 100]],
      urine_output: [[0, 70], [12, 50], [24, 40], [36, 40], [48, 41], [60, 40]],
    })
    const pi = assessPatient(rec, { asOf: at(60) })
    expect(hasWorseningTrend(pi.series.systolic_bp!)).toBe(false)
    expect(pi.recognizedPatterns.some((p) => p.kind === 'multi_signal_deterioration')).toBe(false)
    expect(pi.overallTrajectory).not.toBe('worsening')
    expect(pi.overallTrajectory).not.toBe('rapidly_worsening')
  })

  it('replaying well after the last measurement anchors the projection to `asOf` and flags stale data', () => {
    const rec = record('stale', { sodium: [[0, 138], [24, 134], [48, 130]] })
    const fresh = sodiumPattern(assessPatient(rec, { asOf: at(48) }))!
    expect(fresh.prediction.projection?.thresholdStatus).toBe('ahead')
    expect(fresh.prediction.projection?.measuredHoursAgo).toBe(0)
    const freshHours = fresh.prediction.projection!.hoursToThreshold!
    expect(freshHours).toBeGreaterThan(0)

    // 12 h later, no new measurement: the same threshold is nearer, not the same distance away
    const later = sodiumPattern(assessPatient(rec, { asOf: at(60) }))!
    expect(later.prediction.projection?.measuredHoursAgo).toBe(12)
    expect(later.prediction.projection?.hoursToThreshold).toBeCloseTo(freshHours - 12, 6)

    // 3 days later: the extrapolated crossing time has passed without confirmation
    const stale = sodiumPattern(assessPatient(rec, { asOf: at(48 + 72) }))!
    expect(stale.prediction.projection?.thresholdStatus).toBe('overdue')
    expect(stale.prediction.projection?.hoursToThreshold).toBe(0)
    expect(stale.prediction.statement).not.toMatch(/already beyond/)
    expect(stale.prediction.statement).toMatch(/would have reached/)
    expect(stale.prediction.statement).toMatch(/No measurement since/)
    expect(stale.prediction.uncertainty.some((u) => /old at the assessment time/.test(u))).toBe(true)
    expect(fresh.prediction.uncertainty.some((u) => /old at the assessment time/.test(u))).toBe(false)
  })
})

describe('patient-level aggregation', () => {
  it('a rapidly worsening watch-level pattern makes the patient at least "worsening"', () => {
    // fast fall while still within range: approaching abnormal, watch severity, rapid rate
    const pi = assessPatient(record('rapid-watch', { sodium: [[0, 142], [12, 140], [24, 137]] }))
    const p = sodiumPattern(pi)!
    expect(p.trajectory).toBe('rapidly_worsening')
    expect(p.severity).toBe('watch')
    expect(['worsening', 'rapidly_worsening']).toContain(pi.overallTrajectory)
  })

  it('a changed signal belonging to a minor pattern is marked partOfPattern', () => {
    const pi = assessPatient(record('minor-change', { glucose: [[0, 168], [24, 182], [48, 196]] }))
    const p = pi.recognizedPatterns.find((r) => r.signals.includes('glucose'))!
    expect(p.severity).toBe('minor')
    const change = pi.changedSinceLastReview.find((c) => c.signal === 'glucose')!
    expect(change.partOfPattern).toBe(true)
  })

  it('unbounded diagnostic signals are not reassured as "within range"', () => {
    const pi = assessPatient(record('uosm-quiet', { urine_osmolality: [[0, 400], [24, 410]], urine_sodium: [[0, 30]], sodium: [[0, 140], [24, 139]] }))
    const ids = pi.reassuringSignals.map((r) => r.signal)
    expect(ids).not.toContain('urine_osmolality')
    expect(ids).not.toContain('urine_sodium')
    expect(pi.reassuringSignals.find((r) => r.signal === 'sodium')?.status).toBe('within_range')
  })

  it('assessWard assesses every patient at one shared default instant', () => {
    const early = record('early', { sodium: [[0, 138], [24, 133], [48, 127]] })
    const late = record('late', { sodium: [[0, 140], [96, 139]] })
    const ward = assessWard([early, late])
    const asOfs = new Set(ward.map((pi) => pi.asOf))
    expect(asOfs.size).toBe(1)
    expect([...asOfs][0]).toBe(at(96))
    // an explicit asOf is respected for every patient
    const replay = assessWard([early, late], { asOf: at(48) })
    expect(new Set(replay.map((pi) => pi.asOf))).toEqual(new Set([at(48)]))
  })
})
