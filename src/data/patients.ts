import type { ClinicalEvent, MedicationEvent, Observation, Patient, SignalId } from '../engine/types'

/** All patients are synthetic. "Now" for the demo ward. */
export const NOW = '2026-09-25T08:00:00.000Z'

function hoursAgo(h: number): string {
  return new Date(new Date(NOW).getTime() - h * 3_600_000).toISOString()
}

function at(admission: string, hours: number): string {
  return new Date(new Date(admission).getTime() + hours * 3_600_000).toISOString()
}

function series(admission: string, signal: SignalId, points: [number, number][]): Observation[] {
  return points.map(([h, value]) => ({ signal, time: at(admission, h), value }))
}

function med(
  admission: string,
  hours: number,
  name: string,
  classes: MedicationEvent['classes'],
  action: MedicationEvent['action'],
  detail?: string,
): MedicationEvent {
  return { name, classes, time: at(admission, hours), action, detail }
}

function ev(admission: string, hours: number, kind: ClinicalEvent['kind'], description: string): ClinicalEvent {
  return { time: at(admission, hours), kind, description }
}

/* ------------------------------------------------------------------------------------ */
/* 1. Progressive abnormality deserving attention: sodium falling after a new thiazide.  */
/* ------------------------------------------------------------------------------------ */
const p1Adm = hoursAgo(72)
const p1: Patient = {
  id: 'p1',
  name: 'Margaret Hale',
  age: 74,
  sex: 'F',
  bed: '12',
  admissionTime: p1Adm,
  admittingDiagnosis: 'COPD exacerbation',
  problems: ['COPD', 'Hypertension', 'Depression'],
  baselines: {},
  scenario: 'A progressive abnormality that deserves attention: sodium falling steadily after a newly started thiazide.',
  observations: [
    ...series(p1Adm, 'sodium', [[0, 138], [24, 134], [48, 130], [72, 127]]),
    ...series(p1Adm, 'potassium', [[0, 4.1], [24, 4.0], [48, 3.9], [72, 3.9]]),
    ...series(p1Adm, 'creatinine', [[0, 0.8], [24, 0.8], [48, 0.9], [72, 0.8]]),
    ...series(p1Adm, 'glucose', [[0, 105], [24, 112], [48, 98], [72, 108]]),
    ...series(p1Adm, 'wbc', [[0, 9.8], [48, 9.1], [72, 8.7]]),
    ...series(p1Adm, 'systolic_bp', [[0, 148], [24, 142], [48, 138], [72, 136]]),
    ...series(p1Adm, 'heart_rate', [[0, 78], [24, 80], [48, 76], [72, 82]]),
    ...series(p1Adm, 'respiratory_rate', [[0, 18], [24, 18], [48, 17], [72, 18]]),
    ...series(p1Adm, 'spo2', [[0, 94], [24, 95], [48, 95], [72, 95]]),
    ...series(p1Adm, 'oxygen_lpm', [[0, 2], [24, 2], [48, 1], [72, 1]]),
    ...series(p1Adm, 'temperature', [[0, 37.0], [24, 36.9], [48, 37.1], [72, 37.0]]),
    ...series(p1Adm, 'urine_output', [[0, 55], [24, 60], [48, 58], [72, 52]]),
  ],
  medications: [
    med(p1Adm, 2, 'Hydrochlorothiazide 25 mg', ['thiazide', 'antihypertensive'], 'started', 'for blood pressure'),
    med(p1Adm, 0, 'Sertraline 50 mg', ['ssri'], 'continued', 'long-term'),
    med(p1Adm, 1, 'Prednisolone 30 mg', ['steroid'], 'started', '5-day course'),
    med(p1Adm, 1, 'Salbutamol nebulised', ['bronchodilator'], 'started'),
  ],
  events: [
    ev(p1Adm, 0, 'admission', 'Admitted with increased breathlessness and wheeze; CXR no consolidation'),
    ev(p1Adm, 70, 'nursing', 'Mild nausea overnight; slightly drowsy this morning but rousable'),
  ],
}

/* ------------------------------------------------------------------------------------ */
/* 2. Subtle multi-system deterioration: no single value crosses a conventional threshold */
/* ------------------------------------------------------------------------------------ */
const p2Adm = hoursAgo(48)
const p2: Patient = {
  id: 'p2',
  name: 'Daniel Okafor',
  age: 68,
  sex: 'M',
  bed: '7',
  admissionTime: p2Adm,
  admittingDiagnosis: 'Left leg cellulitis',
  problems: ['Type 2 diabetes', 'Hypertension', 'Osteoarthritis'],
  baselines: {},
  scenario: 'A subtle multi-system deterioration: blood pressure, urine output, creatinine, heart rate, respiratory rate, oxygen and temperature all drifting the wrong way while each remains near its reference range.',
  observations: [
    ...series(p2Adm, 'systolic_bp', [[0, 134], [12, 128], [24, 121], [36, 113], [48, 105]]),
    ...series(p2Adm, 'heart_rate', [[0, 74], [12, 81], [24, 88], [36, 94], [48, 100]]),
    ...series(p2Adm, 'respiratory_rate', [[0, 12], [12, 14], [24, 16], [36, 18], [48, 20]]),
    ...series(p2Adm, 'oxygen_lpm', [[0, 0], [12, 0], [24, 1], [36, 1], [48, 2]]),
    ...series(p2Adm, 'spo2', [[0, 97], [12, 96], [24, 95], [36, 94], [48, 94]]),
    ...series(p2Adm, 'temperature', [[0, 36.8], [12, 37.1], [24, 37.4], [36, 37.7], [48, 37.9]]),
    ...series(p2Adm, 'urine_output', [[0, 65], [12, 55], [24, 45], [36, 36], [48, 28]]),
    ...series(p2Adm, 'creatinine', [[0, 0.9], [24, 1.05], [48, 1.3]]),
    ...series(p2Adm, 'wbc', [[0, 9.5], [24, 11.2], [48, 12.0]]),
    ...series(p2Adm, 'sodium', [[0, 137], [24, 136], [48, 136]]),
    ...series(p2Adm, 'potassium', [[0, 4.3], [24, 4.4], [48, 4.6]]),
    ...series(p2Adm, 'glucose', [[0, 168], [24, 182], [48, 176]]),
    ...series(p2Adm, 'hemoglobin', [[0, 13.4], [48, 13.1]]),
  ],
  medications: [
    med(p2Adm, 1, 'Flucloxacillin IV', ['antibiotic'], 'started'),
    med(p2Adm, 0, 'Ramipril 10 mg', ['ace_inhibitor', 'antihypertensive'], 'continued', 'long-term'),
    med(p2Adm, 0, 'Ibuprofen 400 mg PRN', ['nsaid'], 'continued', 'taken twice daily for leg pain'),
    med(p2Adm, 0, 'Metformin 1 g', ['other'], 'continued'),
  ],
  events: [
    ev(p2Adm, 0, 'admission', 'Erythema and warmth left shin to knee; margins marked'),
    ev(p2Adm, 46, 'nursing', 'Patient reports feeling "washed out"; less interested in food'),
  ],
}

/* ------------------------------------------------------------------------------------ */
/* 3. Mildly abnormal trend that does NOT deserve alarm.                                 */
/* ------------------------------------------------------------------------------------ */
const p3Adm = hoursAgo(48)
const p3: Patient = {
  id: 'p3',
  name: 'Priya Raman',
  age: 58,
  sex: 'F',
  bed: '3',
  admissionTime: p3Adm,
  admittingDiagnosis: 'Laparoscopic appendicectomy (post-op day 2)',
  problems: ['Appendicitis', 'Hypothyroidism (treated)'],
  baselines: {},
  scenario: 'A mildly abnormal trend that does not deserve alarm: sodium 135 → 133 → 132 with everything else stable.',
  observations: [
    ...series(p3Adm, 'sodium', [[0, 135], [24, 133], [48, 132]]),
    ...series(p3Adm, 'potassium', [[0, 4.0], [24, 4.1], [48, 4.0]]),
    ...series(p3Adm, 'creatinine', [[0, 0.7], [24, 0.7], [48, 0.7]]),
    ...series(p3Adm, 'hemoglobin', [[0, 12.8], [24, 12.4], [48, 12.5]]),
    ...series(p3Adm, 'wbc', [[0, 9.5], [24, 8.9], [48, 8.2]]),
    ...series(p3Adm, 'glucose', [[0, 98], [24, 104], [48, 92]]),
    ...series(p3Adm, 'systolic_bp', [[0, 122], [24, 118], [48, 124]]),
    ...series(p3Adm, 'heart_rate', [[0, 72], [24, 76], [48, 70]]),
    ...series(p3Adm, 'respiratory_rate', [[0, 14], [24, 14], [48, 15]]),
    ...series(p3Adm, 'spo2', [[0, 97], [24, 98], [48, 97]]),
    ...series(p3Adm, 'temperature', [[0, 36.8], [24, 37.0], [48, 36.9]]),
    ...series(p3Adm, 'urine_output', [[0, 55], [24, 60], [48, 50]]),
  ],
  medications: [
    med(p3Adm, 0, '5% dextrose 1 L', ['other'], 'started', 'maintenance fluid post-op'),
    med(p3Adm, 20, '5% dextrose 1 L', ['other'], 'stopped', 'oral intake re-established'),
    med(p3Adm, 4, 'Enoxaparin 40 mg', ['anticoagulant'], 'started', 'prophylactic dose'),
    med(p3Adm, 0, 'Levothyroxine 75 µg', ['other'], 'continued'),
    med(p3Adm, 0, 'Paracetamol 1 g', ['other'], 'started'),
  ],
  events: [
    ev(p3Adm, 0, 'procedure', 'Uncomplicated laparoscopic appendicectomy'),
    ev(p3Adm, 44, 'nursing', 'Mobilising independently, tolerating diet, pain controlled'),
  ],
}

/* ------------------------------------------------------------------------------------ */
/* 4. Improving patient: pneumonia responding to treatment.                              */
/* ------------------------------------------------------------------------------------ */
const p4Adm = hoursAgo(96)
const p4: Patient = {
  id: 'p4',
  name: 'Tomás Ferreira',
  age: 45,
  sex: 'M',
  bed: '9',
  admissionTime: p4Adm,
  admittingDiagnosis: 'Community-acquired pneumonia',
  problems: ['Pneumonia (right lower lobe)', 'Ex-smoker'],
  baselines: {},
  scenario: 'An improving patient: every abnormal signal is moving back toward its range under treatment.',
  observations: [
    ...series(p4Adm, 'oxygen_lpm', [[0, 4], [24, 3], [48, 2], [72, 1], [96, 0]]),
    ...series(p4Adm, 'respiratory_rate', [[0, 26], [24, 23], [48, 20], [72, 18], [96, 16]]),
    ...series(p4Adm, 'spo2', [[0, 91], [24, 93], [48, 95], [72, 96], [96, 97]]),
    ...series(p4Adm, 'heart_rate', [[0, 112], [24, 102], [48, 92], [72, 84], [96, 76]]),
    ...series(p4Adm, 'temperature', [[0, 38.9], [24, 38.3], [48, 37.6], [72, 37.1], [96, 36.8]]),
    ...series(p4Adm, 'crp', [[0, 240], [24, 190], [48, 120], [72, 70], [96, 38]]),
    ...series(p4Adm, 'wbc', [[0, 17.5], [24, 15.2], [48, 12.1], [72, 9.8], [96, 8.1]]),
    ...series(p4Adm, 'sodium', [[0, 129], [24, 131], [48, 133], [72, 135], [96, 136]]),
    ...series(p4Adm, 'systolic_bp', [[0, 108], [24, 114], [48, 118], [72, 122], [96, 124]]),
    ...series(p4Adm, 'creatinine', [[0, 1.1], [24, 1.0], [48, 0.9], [72, 0.9], [96, 0.9]]),
    ...series(p4Adm, 'lactate', [[0, 2.6], [24, 1.4]]),
    ...series(p4Adm, 'urine_output', [[0, 40], [24, 50], [48, 60], [72, 65], [96, 70]]),
  ],
  medications: [
    med(p4Adm, 1, 'Co-amoxiclav IV', ['antibiotic'], 'started'),
    med(p4Adm, 1, 'Clarithromycin', ['antibiotic'], 'started'),
    med(p4Adm, 72, 'Clarithromycin', ['antibiotic'], 'stopped', 'atypical screen negative'),
    med(p4Adm, 2, 'Enoxaparin 40 mg', ['anticoagulant'], 'started', 'prophylactic dose'),
  ],
  events: [
    ev(p4Adm, 0, 'imaging', 'CXR: right lower lobe consolidation'),
    ev(p4Adm, 48, 'microbiology', 'Blood cultures: no growth at 48 h'),
    ev(p4Adm, 94, 'nursing', 'Off oxygen overnight, eating well, mobilising independently'),
  ],
}

/* ------------------------------------------------------------------------------------ */
/* 5. Stable chronic abnormalities that should not repeatedly trigger warnings.         */
/* ------------------------------------------------------------------------------------ */
const p5Adm = hoursAgo(72)
const p5: Patient = {
  id: 'p5',
  name: 'Walter Brandt',
  age: 81,
  sex: 'M',
  bed: '15',
  admissionTime: p5Adm,
  admittingDiagnosis: 'Mechanical fall, no fracture',
  problems: ['CKD stage 4', 'Anaemia of chronic kidney disease', 'Type 2 diabetes', 'Hypertension'],
  baselines: { creatinine: 3.1, hemoglobin: 9.8, potassium: 5.2, bicarbonate: 20, urea: 18 },
  scenario: 'Stable chronic abnormalities: creatinine, haemoglobin, potassium and bicarbonate are all out of range but sitting at this patient\'s known baseline.',
  observations: [
    ...series(p5Adm, 'creatinine', [[0, 3.2], [24, 3.1], [48, 3.3], [72, 3.1]]),
    ...series(p5Adm, 'urea', [[0, 18.2], [24, 17.6], [48, 18.5], [72, 18.0]]),
    ...series(p5Adm, 'hemoglobin', [[0, 9.9], [24, 9.7], [48, 9.8], [72, 9.7]]),
    ...series(p5Adm, 'potassium', [[0, 5.2], [24, 5.1], [48, 5.3], [72, 5.2]]),
    ...series(p5Adm, 'bicarbonate', [[0, 20], [24, 21], [48, 20], [72, 21]]),
    ...series(p5Adm, 'sodium', [[0, 139], [24, 140], [48, 138], [72, 139]]),
    ...series(p5Adm, 'glucose', [[0, 130], [24, 138], [48, 126], [72, 134]]),
    ...series(p5Adm, 'systolic_bp', [[0, 138], [24, 134], [48, 140], [72, 136]]),
    ...series(p5Adm, 'heart_rate', [[0, 68], [24, 72], [48, 70], [72, 66]]),
    ...series(p5Adm, 'respiratory_rate', [[0, 16], [24, 16], [48, 15], [72, 16]]),
    ...series(p5Adm, 'spo2', [[0, 96], [24, 97], [48, 96], [72, 97]]),
    ...series(p5Adm, 'temperature', [[0, 36.7], [24, 36.8], [48, 36.6], [72, 36.7]]),
    ...series(p5Adm, 'urine_output', [[0, 45], [24, 50], [48, 40], [72, 48]]),
  ],
  medications: [
    med(p5Adm, 0, 'Amlodipine 10 mg', ['antihypertensive'], 'continued'),
    med(p5Adm, 0, 'Insulin glargine 14 units', ['insulin'], 'continued'),
    med(p5Adm, 0, 'Sodium bicarbonate 1 g', ['other'], 'continued'),
    med(p5Adm, 0, 'Atorvastatin 20 mg', ['other'], 'continued'),
  ],
  events: [
    ev(p5Adm, 0, 'imaging', 'Pelvis and hip X-ray: no fracture'),
    ev(p5Adm, 26, 'note', 'Physiotherapy: safe with frame; awaiting home assessment'),
  ],
}

export const PATIENTS: Patient[] = [p1, p2, p3, p4, p5]
