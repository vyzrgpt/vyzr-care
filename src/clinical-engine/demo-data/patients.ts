/**
 * Synthetic demo ward. Every patient, value and event here is invented for the hackathon
 * demonstration; nothing is derived from real patient data.
 *
 * Scenarios (acceptance criteria from the engineering brief):
 *   A  mild sodium drift 133 → 132, otherwise stable         → minor, non-interruptive
 *   B  progressive sodium decline 138 → 133 → 127 on thiazide → concerning, with evidence
 *   C  multisystem: O₂ 2→3→5, RR 18→22→27, SBP 126→110→98, Cr 0.9→1.2→1.5, UO falling
 *   D  improving pneumonia: previously abnormal values normalising
 *   E  stable CKD abnormalities at known baseline             → suppressed / reassuring
 *   F  renal deterioration: creatinine + urea rising, urine output falling, NSAID + contrast
 *   G  possible occult bleeding: haemoglobin falling with rising HR on anticoagulation
 */
import { SIGNALS } from '../signals'
import type {
  ClinicalObservation,
  EventCategory,
  MedicationAction,
  MedicationClass,
  PatientRecord,
  SignalId,
} from '../types'

/** "Now" for the demo ward (fixed so outputs are reproducible). */
export const NOW = '2026-09-25T08:00:00.000Z'

function hoursAgo(h: number): string {
  return new Date(new Date(NOW).getTime() - h * 3_600_000).toISOString()
}

function at(admission: string, hours: number): string {
  return new Date(new Date(admission).getTime() + hours * 3_600_000).toISOString()
}

/** Small builder that emits `ClinicalObservation`s with stable ids relative to admission. */
class Timeline {
  private n = 0
  readonly items: ClinicalObservation[] = []
  constructor(
    private readonly patientId: string,
    private readonly admission: string,
  ) {}

  private nextId(prefix: string): string {
    this.n += 1
    return `${this.patientId}-${prefix}-${String(this.n).padStart(3, '0')}`
  }

  /** Numeric series: `[hoursAfterAdmission, value]` pairs. */
  series(code: SignalId, points: [number, number][]): this {
    const def = SIGNALS[code]
    for (const [h, value] of points) {
      this.items.push({
        id: this.nextId(code),
        patientId: this.patientId,
        time: at(this.admission, h),
        category: def.category,
        code,
        name: def.label,
        value,
        unit: def.unit,
        referenceRange: { low: def.low, high: def.high },
      })
    }
    return this
  }

  med(hours: number, name: string, classes: MedicationClass[], action: MedicationAction, detail?: string): this {
    this.items.push({ id: this.nextId('med'), patientId: this.patientId, time: at(this.admission, hours), category: 'medication', name, classes, action, detail })
    return this
  }

  event(hours: number, category: EventCategory, description: string): this {
    this.items.push({ id: this.nextId(category), patientId: this.patientId, time: at(this.admission, hours), category, description })
    return this
  }
}

/* ------------------------------------------------------------------------------------ */
/* A. Mild sodium drift that does NOT deserve alarm.                                     */
/* ------------------------------------------------------------------------------------ */
const aAdm = hoursAgo(48)
const patientA: PatientRecord = {
  patientId: 'pt-a',
  name: 'Priya Raman',
  age: 58,
  sex: 'F',
  location: 'Bed 3',
  admissionTime: aAdm,
  admittingDiagnosis: 'Laparoscopic appendicectomy (post-op day 2)',
  problems: ['Appendicitis', 'Hypothyroidism (treated)'],
  knownBaselines: {},
  scenario: 'Mild sodium drift 133 → 132 with everything else stable: abnormal, but not concerning. Should stay non-interruptive.',
  timeline: new Timeline('pt-a', aAdm)
    .series('sodium', [[24, 133], [48, 132]])
    .series('potassium', [[0, 4.0], [24, 4.1], [48, 4.0]])
    .series('creatinine', [[0, 0.7], [24, 0.7], [48, 0.7]])
    .series('hemoglobin', [[0, 12.8], [24, 12.4], [48, 12.5]])
    .series('wbc', [[0, 9.5], [24, 8.9], [48, 8.2]])
    .series('glucose', [[0, 98], [24, 104], [48, 92]])
    .series('systolic_bp', [[0, 122], [24, 118], [48, 124]])
    .series('heart_rate', [[0, 72], [24, 76], [48, 70]])
    .series('respiratory_rate', [[0, 14], [24, 14], [48, 15]])
    .series('spo2', [[0, 97], [24, 98], [48, 97]])
    .series('temperature', [[0, 36.8], [24, 37.0], [48, 36.9]])
    .series('urine_output', [[0, 55], [24, 60], [48, 50]])
    .med(0, '5% dextrose 1 L', ['iv_fluid'], 'started', 'maintenance fluid post-op')
    .med(20, '5% dextrose 1 L', ['iv_fluid'], 'stopped', 'oral intake re-established')
    .med(4, 'Enoxaparin 40 mg', ['anticoagulant'], 'started', 'prophylactic dose')
    .med(0, 'Levothyroxine 75 µg', ['other'], 'continued')
    .event(0, 'procedure', 'Uncomplicated laparoscopic appendicectomy')
    .event(44, 'nursing', 'Mobilising independently, tolerating diet, pain controlled').items,
}

/* ------------------------------------------------------------------------------------ */
/* B. Progressive sodium decline after a newly started thiazide.                          */
/* ------------------------------------------------------------------------------------ */
const bAdm = hoursAgo(48)
const patientB: PatientRecord = {
  patientId: 'pt-b',
  name: 'Margaret Hale',
  age: 74,
  sex: 'F',
  location: 'Bed 12',
  admissionTime: bAdm,
  admittingDiagnosis: 'COPD exacerbation',
  problems: ['COPD', 'Hypertension', 'Depression'],
  knownBaselines: {},
  scenario: 'Progressive sodium decline 138 → 133 → 127 over 48 h with new thiazide exposure; osmolality and urine studies not yet sent.',
  timeline: new Timeline('pt-b', bAdm)
    .series('sodium', [[0, 138], [24, 133], [48, 127]])
    .series('potassium', [[0, 4.1], [24, 4.0], [48, 3.8]])
    .series('creatinine', [[0, 0.8], [24, 0.8], [48, 0.8]])
    .series('glucose', [[0, 105], [24, 112], [48, 108]])
    .series('wbc', [[0, 9.8], [48, 8.7]])
    .series('systolic_bp', [[0, 148], [24, 142], [48, 138]])
    .series('heart_rate', [[0, 78], [24, 80], [48, 82]])
    .series('respiratory_rate', [[0, 18], [24, 18], [48, 18]])
    .series('spo2', [[0, 94], [24, 95], [48, 95]])
    .series('oxygen_lpm', [[0, 2], [24, 2], [48, 1]])
    .series('temperature', [[0, 37.0], [24, 36.9], [48, 37.0]])
    .series('urine_output', [[0, 55], [24, 60], [48, 52]])
    .med(2, 'Hydrochlorothiazide 25 mg', ['thiazide', 'antihypertensive'], 'started', 'for blood pressure')
    .med(0, 'Sertraline 50 mg', ['ssri'], 'continued', 'long-term')
    .med(1, 'Prednisolone 30 mg', ['steroid'], 'started', '5-day course')
    .med(1, 'Salbutamol nebulised', ['bronchodilator'], 'started')
    .event(0, 'clinical_event', 'Admitted with increased breathlessness and wheeze; CXR no consolidation')
    .event(46, 'nursing', 'Mild nausea overnight; slightly drowsy this morning but rousable').items,
}

/* ------------------------------------------------------------------------------------ */
/* C. Multisystem deterioration: modest signals worsening concurrently.                  */
/* ------------------------------------------------------------------------------------ */
const cAdm = hoursAgo(48)
const patientC: PatientRecord = {
  patientId: 'pt-c',
  name: 'Daniel Okafor',
  age: 68,
  sex: 'M',
  location: 'Bed 7',
  admissionTime: cAdm,
  admittingDiagnosis: 'Left leg cellulitis',
  problems: ['Type 2 diabetes', 'Hypertension', 'Osteoarthritis'],
  knownBaselines: {},
  scenario: 'Oxygen 2 → 3 → 5 L, RR 18 → 22 → 27, SBP 126 → 110 → 98, creatinine 0.9 → 1.2 → 1.5, urine output falling: the combination matters more than any single value.',
  timeline: new Timeline('pt-c', cAdm)
    .series('oxygen_lpm', [[0, 2], [24, 3], [48, 5]])
    .series('respiratory_rate', [[0, 18], [24, 22], [48, 27]])
    .series('spo2', [[0, 96], [24, 94], [48, 92]])
    .series('systolic_bp', [[0, 126], [24, 110], [48, 98]])
    .series('heart_rate', [[0, 84], [24, 96], [48, 108]])
    .series('creatinine', [[0, 0.9], [24, 1.2], [48, 1.5]])
    .series('urine_output', [[0, 60], [12, 50], [24, 42], [36, 33], [48, 24]])
    .series('temperature', [[0, 37.2], [24, 37.8], [48, 38.3]])
    .series('wbc', [[0, 11.5], [24, 13.2], [48, 15.8]])
    .series('sodium', [[0, 137], [24, 136], [48, 136]])
    .series('potassium', [[0, 4.3], [24, 4.4], [48, 4.7]])
    .series('glucose', [[0, 168], [24, 182], [48, 196]])
    .series('hemoglobin', [[0, 13.4], [48, 13.1]])
    .med(1, 'Flucloxacillin IV', ['antibiotic'], 'started')
    .med(0, 'Ramipril 10 mg', ['ace_inhibitor', 'antihypertensive'], 'continued', 'long-term')
    .med(0, 'Ibuprofen 400 mg PRN', ['nsaid'], 'continued', 'taken twice daily for leg pain')
    .med(0, 'Metformin 1 g', ['other'], 'continued')
    .event(0, 'clinical_event', 'Erythema and warmth left shin to knee; margins marked')
    .event(46, 'nursing', 'Patient reports feeling "washed out"; less interested in food').items,
}

/* ------------------------------------------------------------------------------------ */
/* D. Improving patient: pneumonia responding to treatment.                              */
/* ------------------------------------------------------------------------------------ */
const dAdm = hoursAgo(96)
const patientD: PatientRecord = {
  patientId: 'pt-d',
  name: 'Tomás Ferreira',
  age: 45,
  sex: 'M',
  location: 'Bed 9',
  admissionTime: dAdm,
  admittingDiagnosis: 'Community-acquired pneumonia',
  problems: ['Pneumonia (right lower lobe)', 'Ex-smoker'],
  knownBaselines: {},
  scenario: 'Improving: every previously abnormal signal is moving back toward its range under treatment. Must not produce a red alert.',
  timeline: new Timeline('pt-d', dAdm)
    .series('oxygen_lpm', [[0, 4], [24, 3], [48, 2], [72, 1], [96, 0]])
    .series('respiratory_rate', [[0, 26], [24, 23], [48, 20], [72, 18], [96, 16]])
    .series('spo2', [[0, 91], [24, 93], [48, 95], [72, 96], [96, 97]])
    .series('heart_rate', [[0, 112], [24, 102], [48, 92], [72, 84], [96, 76]])
    .series('temperature', [[0, 38.9], [24, 38.3], [48, 37.6], [72, 37.1], [96, 36.8]])
    .series('crp', [[0, 240], [24, 190], [48, 120], [72, 70], [96, 38]])
    .series('wbc', [[0, 17.5], [24, 15.2], [48, 12.1], [72, 9.8], [96, 8.1]])
    .series('sodium', [[0, 129], [24, 131], [48, 133], [72, 135], [96, 136]])
    .series('systolic_bp', [[0, 108], [24, 114], [48, 118], [72, 122], [96, 124]])
    .series('creatinine', [[0, 1.1], [24, 1.0], [48, 0.9], [72, 0.9], [96, 0.9]])
    .series('lactate', [[0, 2.6], [24, 1.4]])
    .series('urine_output', [[0, 40], [24, 50], [48, 60], [72, 65], [96, 70]])
    .med(1, 'Co-amoxiclav IV', ['antibiotic'], 'started')
    .med(1, 'Clarithromycin', ['antibiotic'], 'started')
    .med(72, 'Clarithromycin', ['antibiotic'], 'stopped', 'atypical screen negative')
    .med(2, 'Enoxaparin 40 mg', ['anticoagulant'], 'started', 'prophylactic dose')
    .event(0, 'imaging', 'CXR: right lower lobe consolidation')
    .event(48, 'microbiology', 'Blood cultures: no growth at 48 h')
    .event(94, 'nursing', 'Off oxygen overnight, eating well, mobilising independently').items,
}

/* ------------------------------------------------------------------------------------ */
/* E. Stable chronic abnormalities that should not repeatedly trigger warnings.          */
/* ------------------------------------------------------------------------------------ */
const eAdm = hoursAgo(72)
const patientE: PatientRecord = {
  patientId: 'pt-e',
  name: 'Walter Brandt',
  age: 81,
  sex: 'M',
  location: 'Bed 15',
  admissionTime: eAdm,
  admittingDiagnosis: 'Mechanical fall, no fracture',
  problems: ['CKD stage 4', 'Anaemia of chronic kidney disease', 'Type 2 diabetes', 'Hypertension'],
  knownBaselines: { creatinine: 3.1, hemoglobin: 9.8, potassium: 5.2, bicarbonate: 20, urea: 18 },
  scenario: 'Creatinine, urea, haemoglobin, potassium and bicarbonate are all out of range but sitting at this patient\'s known baseline. No repeated warnings.',
  timeline: new Timeline('pt-e', eAdm)
    .series('creatinine', [[0, 3.2], [24, 3.1], [48, 3.3], [72, 3.1]])
    .series('urea', [[0, 18.2], [24, 17.6], [48, 18.5], [72, 18.0]])
    .series('hemoglobin', [[0, 9.9], [24, 9.7], [48, 9.8], [72, 9.7]])
    .series('potassium', [[0, 5.2], [24, 5.1], [48, 5.3], [72, 5.2]])
    .series('bicarbonate', [[0, 20], [24, 21], [48, 20], [72, 21]])
    .series('sodium', [[0, 139], [24, 140], [48, 138], [72, 139]])
    .series('glucose', [[0, 130], [24, 138], [48, 126], [72, 134]])
    .series('systolic_bp', [[0, 138], [24, 134], [48, 140], [72, 136]])
    .series('heart_rate', [[0, 68], [24, 72], [48, 70], [72, 66]])
    .series('respiratory_rate', [[0, 16], [24, 16], [48, 15], [72, 16]])
    .series('spo2', [[0, 96], [24, 97], [48, 96], [72, 97]])
    .series('temperature', [[0, 36.7], [24, 36.8], [48, 36.6], [72, 36.7]])
    .series('urine_output', [[0, 45], [24, 50], [48, 40], [72, 48]])
    .med(0, 'Amlodipine 10 mg', ['antihypertensive'], 'continued')
    .med(0, 'Insulin glargine 14 units', ['insulin'], 'continued')
    .med(0, 'Sodium bicarbonate 1 g', ['other'], 'continued')
    .event(0, 'imaging', 'Pelvis and hip X-ray: no fracture')
    .event(26, 'note', 'Physiotherapy: safe with frame; awaiting home assessment').items,
}

/* ------------------------------------------------------------------------------------ */
/* F. Renal deterioration: creatinine and urea rising, urine output falling, NSAID+contrast */
/* ------------------------------------------------------------------------------------ */
const fAdm = hoursAgo(72)
const patientF: PatientRecord = {
  patientId: 'pt-f',
  name: 'Aisha Rahman',
  age: 66,
  sex: 'F',
  location: 'Bed 5',
  admissionTime: fAdm,
  admittingDiagnosis: 'Acute pancreatitis (gallstone)',
  problems: ['Gallstones', 'Hypertension', 'Osteoarthritis'],
  knownBaselines: {},
  scenario: 'Renal deterioration: creatinine 0.9 → 1.1 → 1.4 → 1.8 with rising urea and falling urine output after CT contrast, on an NSAID and an ARB; haemodynamics only mildly soft.',
  timeline: new Timeline('pt-f', fAdm)
    .series('creatinine', [[0, 0.9], [24, 1.1], [48, 1.4], [72, 1.8]])
    .series('urea', [[0, 5.2], [24, 6.9], [48, 9.4], [72, 12.6]])
    .series('urine_output', [[0, 70], [24, 55], [48, 40], [72, 27]])
    .series('potassium', [[0, 4.0], [24, 4.3], [48, 4.6], [72, 5.0]])
    .series('bicarbonate', [[0, 24], [24, 23], [48, 22], [72, 21]])
    .series('systolic_bp', [[0, 128], [24, 124], [48, 118], [72, 112]])
    .series('heart_rate', [[0, 88], [24, 90], [48, 92], [72, 94]])
    .series('respiratory_rate', [[0, 18], [24, 18], [48, 19], [72, 19]])
    .series('spo2', [[0, 96], [24, 96], [48, 95], [72, 96]])
    .series('temperature', [[0, 37.6], [24, 37.4], [48, 37.2], [72, 37.1]])
    .series('sodium', [[0, 138], [24, 137], [48, 137], [72, 136]])
    .series('crp', [[0, 180], [24, 210], [48, 170], [72, 140]])
    .series('wbc', [[0, 14.2], [24, 13.8], [48, 12.4], [72, 11.6]])
    .med(0, 'Losartan 100 mg', ['arb', 'antihypertensive'], 'continued', 'long-term')
    .med(0, 'Diclofenac 50 mg', ['nsaid'], 'continued', 'regular, for knee pain')
    .med(6, 'IV iodinated contrast', ['contrast'], 'started', 'CT abdomen with contrast')
    .med(0, 'Hartmann\'s solution 125 mL/h', ['iv_fluid'], 'started')
    .med(36, 'Hartmann\'s solution 125 mL/h', ['iv_fluid'], 'dose_changed', 'reduced to 60 mL/h')
    .event(6, 'imaging', 'CT abdomen: oedematous pancreatitis, no necrosis, no collection')
    .event(70, 'nursing', 'Catheter draining concentrated urine; patient thirsty').items,
}

/* ------------------------------------------------------------------------------------ */
/* G. Possible occult bleeding: haemoglobin falling with rising HR on anticoagulation.    */
/* ------------------------------------------------------------------------------------ */
const gAdm = hoursAgo(60)
const patientG: PatientRecord = {
  patientId: 'pt-g',
  name: 'George Whitfield',
  age: 79,
  sex: 'M',
  location: 'Bed 11',
  admissionTime: gAdm,
  admittingDiagnosis: 'Elective right hemicolectomy (post-op day 2)',
  problems: ['Colonic adenocarcinoma', 'Atrial fibrillation', 'Hypertension'],
  knownBaselines: {},
  scenario: 'Haemoglobin 12.6 → 11.4 → 10.3 → 9.1 with heart rate climbing and blood pressure drifting down on therapeutic anticoagulation; INR not rechecked.',
  timeline: new Timeline('pt-g', gAdm)
    .series('hemoglobin', [[0, 12.6], [18, 11.4], [36, 10.3], [60, 9.1]])
    .series('heart_rate', [[0, 76], [18, 84], [36, 92], [48, 98], [60, 104]])
    .series('systolic_bp', [[0, 136], [18, 130], [36, 122], [48, 116], [60, 108]])
    .series('respiratory_rate', [[0, 16], [18, 16], [36, 17], [60, 18]])
    .series('spo2', [[0, 97], [18, 96], [36, 97], [60, 96]])
    .series('temperature', [[0, 36.9], [18, 37.1], [36, 37.0], [60, 37.2]])
    .series('urine_output', [[0, 65], [18, 60], [36, 55], [60, 45]])
    .series('creatinine', [[0, 1.0], [36, 1.0], [60, 1.1]])
    .series('sodium', [[0, 138], [36, 137], [60, 137]])
    .series('potassium', [[0, 4.2], [36, 4.1], [60, 4.0]])
    .series('platelets', [[0, 210], [60, 185]])
    .med(0, 'Apixaban 5 mg BD', ['anticoagulant'], 'continued', 'for atrial fibrillation, restarted post-op')
    .med(12, 'Enoxaparin 40 mg', ['anticoagulant'], 'started', 'prophylactic dose')
    .med(0, 'Bisoprolol 2.5 mg', ['antihypertensive'], 'continued')
    .event(0, 'procedure', 'Uncomplicated laparoscopic right hemicolectomy')
    .event(58, 'nursing', 'Drain output 150 mL dark red overnight; patient reports light-headedness on standing').items,
}

export const PATIENTS: PatientRecord[] = [patientA, patientB, patientC, patientD, patientE, patientF, patientG]

export function findPatient(patientId: string): PatientRecord | undefined {
  return PATIENTS.find((p) => p.patientId === patientId)
}
