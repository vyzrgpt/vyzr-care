import type { ClinicalDomain, MedicationClass, SignalId, TimeHorizon } from './types'

/**
 * PATTERN LIBRARY — DEMO / NOT CLINICALLY VALIDATED.
 *
 * Structured clinical reference content used by the pattern rules: for each abnormal
 * state, what to consider and what to check; for each multi-signal pattern, which signals
 * define it. This file contains no reasoning — the rules in `patterns/` decide *when*
 * an entry applies. Concern thresholds are illustrative demo values.
 */
export interface SignalKnowledge {
  /** Name of the abnormal state, e.g. "hyponatraemia". */
  stateLabel: string
  /** Medication classes that can cause or worsen the abnormality. */
  associatedMedications: MedicationClass[]
  /** Explanation used when an associated medication is present. */
  medicationRelation: string
  causes: string[]
  /** Investigations represented as signals: absence from the record is reported as missing information. */
  investigationSignals: SignalId[]
  /** Other investigations / assessments to consider (free text). */
  investigations: string[]
  reviews: string[]
  /** Level beyond which the complication becomes markedly more likely; used for the time horizon. */
  concernThreshold: number | null
  /** Alternative threshold expressed as a multiple of the patient's baseline (e.g. 1.5 × baseline creatinine). */
  concernThresholdBaselineMultiple?: number
  complication: string
}

type Key = `${SignalId}:${'high' | 'low'}`

export const KNOWLEDGE: Partial<Record<Key, SignalKnowledge>> = {
  'sodium:low': {
    stateLabel: 'hyponatraemia',
    associatedMedications: ['thiazide', 'ssri', 'anticonvulsant', 'desmopressin'],
    medicationRelation: 'recognised cause of hyponatraemia',
    causes: [
      'Thiazide- or SSRI-associated hyponatraemia',
      'SIADH (pulmonary, CNS, drug-related)',
      'Hypovolaemic hyponatraemia (GI losses, diuretics)',
      'Hypervolaemic states (heart failure, cirrhosis)',
      'Adrenal insufficiency or hypothyroidism',
    ],
    investigationSignals: ['serum_osmolality', 'urine_osmolality', 'urine_sodium', 'glucose', 'tsh', 'cortisol'],
    investigations: ['Paired serum and urine osmolality with urine sodium', 'Glucose (exclude pseudo-hyponatraemia)'],
    reviews: ['Fluid status and free-water intake', 'Neurological symptoms (nausea, confusion, drowsiness)', 'Recently started medications'],
    concernThreshold: 125,
    complication: 'symptomatic hyponatraemia (confusion, seizures)',
  },
  'sodium:high': {
    stateLabel: 'hypernatraemia',
    associatedMedications: ['loop_diuretic'],
    medicationRelation: 'can drive free-water loss',
    causes: ['Inadequate free-water intake', 'Osmotic or diuretic-driven water loss', 'Diabetes insipidus'],
    investigationSignals: ['urine_osmolality', 'glucose'],
    investigations: ['Fluid balance review', 'Urine osmolality'],
    reviews: ['Access to oral fluids', 'Enteral feed composition'],
    concernThreshold: 155,
    complication: 'severe hypernatraemia',
  },
  'potassium:high': {
    stateLabel: 'hyperkalaemia',
    associatedMedications: ['ace_inhibitor', 'arb', 'nsaid'],
    medicationRelation: 'reduces renal potassium excretion',
    causes: ['Declining renal function', 'Medication effect (RAAS blockade, potassium-sparing agents)', 'Acidosis'],
    investigationSignals: ['creatinine', 'bicarbonate'],
    investigations: ['ECG if rising', 'Repeat potassium'],
    reviews: ['Potassium-retaining medications', 'Potassium intake and supplements'],
    concernThreshold: 6.0,
    complication: 'arrhythmia',
  },
  'potassium:low': {
    stateLabel: 'hypokalaemia',
    associatedMedications: ['thiazide', 'loop_diuretic', 'insulin', 'steroid'],
    medicationRelation: 'increases potassium loss or cellular shift',
    causes: ['Diuretic losses', 'GI losses', 'Intracellular shift'],
    investigationSignals: [],
    investigations: ['Magnesium', 'ECG if marked'],
    reviews: ['Diuretic dosing', 'GI losses'],
    concernThreshold: 3.0,
    complication: 'arrhythmia',
  },
  'creatinine:high': {
    stateLabel: 'rising creatinine',
    associatedMedications: ['nsaid', 'ace_inhibitor', 'arb', 'aminoglycoside', 'vancomycin', 'contrast', 'loop_diuretic', 'thiazide'],
    medicationRelation: 'can impair renal perfusion or is nephrotoxic',
    causes: ['Reduced renal perfusion (hypovolaemia, hypotension, sepsis)', 'Nephrotoxic medication exposure', 'Urinary obstruction or catheter problem', 'Intrinsic renal disease'],
    investigationSignals: ['urine_output', 'urea', 'potassium', 'bicarbonate', 'lactate'],
    investigations: ['Urinalysis', 'Renal ultrasound if obstruction plausible'],
    reviews: ['Fluid balance and volume status', 'Nephrotoxic and RAAS-blocking medications', 'Recent contrast exposure'],
    concernThreshold: null,
    concernThresholdBaselineMultiple: 1.5,
    complication: 'acute kidney injury',
  },
  'urine_output:low': {
    stateLabel: 'falling urine output',
    associatedMedications: ['nsaid', 'ace_inhibitor', 'arb', 'opioid'],
    medicationRelation: 'can reduce renal perfusion or cause retention',
    causes: ['Hypovolaemia or hypoperfusion', 'Evolving acute kidney injury', 'Retention or blocked catheter'],
    investigationSignals: ['creatinine', 'lactate', 'systolic_bp'],
    investigations: ['Bladder scan / catheter check', 'Fluid balance chart'],
    reviews: ['Volume status', 'Blood pressure trend'],
    concernThreshold: null,
    complication: 'acute kidney injury',
  },
  'hemoglobin:low': {
    stateLabel: 'falling haemoglobin',
    associatedMedications: ['anticoagulant', 'antiplatelet', 'nsaid'],
    medicationRelation: 'increases bleeding risk',
    causes: ['Occult or overt bleeding (GI, procedural site, retroperitoneal)', 'Haemodilution after fluids', 'Haemolysis'],
    investigationSignals: ['platelets', 'inr', 'heart_rate', 'systolic_bp'],
    investigations: ['Repeat haemoglobin', 'Coagulation profile', 'Group and save'],
    reviews: ['Stool and wound assessment', 'Anticoagulant / antiplatelet dosing'],
    concernThreshold: 8,
    complication: 'haemodynamically significant bleeding',
  },
  'platelets:low': {
    stateLabel: 'falling platelets',
    associatedMedications: ['anticoagulant', 'antibiotic'],
    medicationRelation: 'associated with drug-induced thrombocytopaenia',
    causes: ['Sepsis / consumption', 'Drug-induced (heparin, antibiotics)', 'Dilution'],
    investigationSignals: ['inr', 'crp', 'wbc'],
    investigations: ['Coagulation screen', 'Blood film'],
    reviews: ['Heparin exposure', 'Infection context'],
    concernThreshold: 50,
    complication: 'bleeding risk',
  },
  'wbc:high': {
    stateLabel: 'rising white cell count',
    associatedMedications: ['steroid'],
    medicationRelation: 'can raise white cell count without infection',
    causes: ['Evolving infection', 'Inflammatory response', 'Steroid effect'],
    investigationSignals: ['crp', 'temperature', 'lactate'],
    investigations: ['Blood cultures if febrile or unwell', 'Source assessment'],
    reviews: ['Temperature and haemodynamic trend', 'Lines and wounds'],
    concernThreshold: null,
    complication: 'sepsis',
  },
  'crp:high': {
    stateLabel: 'rising CRP',
    associatedMedications: [],
    medicationRelation: '',
    causes: ['Evolving or unresolved infection', 'Post-operative or inflammatory response'],
    investigationSignals: ['wbc', 'temperature'],
    investigations: ['Source assessment', 'Cultures as clinically indicated'],
    reviews: ['Antibiotic response'],
    concernThreshold: null,
    complication: 'uncontrolled infection',
  },
  'lactate:high': {
    stateLabel: 'raised lactate',
    associatedMedications: [],
    medicationRelation: '',
    causes: ['Tissue hypoperfusion', 'Sepsis', 'Reduced clearance'],
    investigationSignals: ['systolic_bp', 'urine_output'],
    investigations: ['Repeat lactate after resuscitation'],
    reviews: ['Perfusion status'],
    concernThreshold: 4,
    complication: 'shock',
  },
  'systolic_bp:low': {
    stateLabel: 'falling blood pressure',
    associatedMedications: ['antihypertensive', 'ace_inhibitor', 'arb', 'opioid', 'sedative', 'thiazide', 'loop_diuretic'],
    medicationRelation: 'lowers blood pressure',
    causes: ['Hypovolaemia', 'Sepsis / vasodilatation', 'Medication effect', 'Cardiogenic causes', 'Bleeding'],
    investigationSignals: ['heart_rate', 'lactate', 'urine_output', 'hemoglobin'],
    investigations: ['Lactate', 'ECG'],
    reviews: ['Antihypertensive and sedative medications', 'Fluid balance'],
    concernThreshold: 90,
    complication: 'hypoperfusion',
  },
  'heart_rate:high': {
    stateLabel: 'rising heart rate',
    associatedMedications: ['bronchodilator'],
    medicationRelation: 'can increase heart rate',
    causes: ['Compensation for hypovolaemia or infection', 'Pain or anxiety', 'Arrhythmia', 'Pulmonary embolism'],
    investigationSignals: ['temperature', 'systolic_bp', 'hemoglobin'],
    investigations: ['ECG'],
    reviews: ['Pain control', 'Volume status'],
    concernThreshold: 120,
    complication: 'haemodynamic compromise',
  },
  'respiratory_rate:high': {
    stateLabel: 'rising respiratory rate',
    associatedMedications: [],
    medicationRelation: '',
    causes: ['Pneumonia or worsening lung pathology', 'Fluid overload', 'Pulmonary embolism', 'Metabolic acidosis', 'Pain'],
    investigationSignals: ['spo2', 'oxygen_lpm', 'lactate', 'bicarbonate'],
    investigations: ['Chest imaging', 'Arterial or venous blood gas'],
    reviews: ['Work of breathing at the bedside'],
    concernThreshold: 25,
    complication: 'respiratory failure',
  },
  'spo2:low': {
    stateLabel: 'falling oxygen saturation',
    associatedMedications: ['opioid', 'sedative'],
    medicationRelation: 'can depress ventilation',
    causes: ['Pneumonia progression', 'Atelectasis', 'Fluid overload', 'Pulmonary embolism'],
    investigationSignals: ['respiratory_rate', 'oxygen_lpm'],
    investigations: ['Chest imaging', 'Blood gas'],
    reviews: ['Oxygen delivery and positioning'],
    concernThreshold: 90,
    complication: 'hypoxaemic respiratory failure',
  },
  'oxygen_lpm:high': {
    stateLabel: 'increasing oxygen requirement',
    associatedMedications: [],
    medicationRelation: '',
    causes: ['Progressing pneumonia', 'Fluid overload / pulmonary oedema', 'Pulmonary embolism', 'Atelectasis or aspiration'],
    investigationSignals: ['respiratory_rate', 'spo2', 'crp', 'wbc'],
    investigations: ['Chest imaging', 'Blood gas'],
    reviews: ['Fluid balance', 'Ventilatory support threshold'],
    concernThreshold: 6,
    complication: 'need for escalated respiratory support',
  },
  'temperature:high': {
    stateLabel: 'rising temperature',
    associatedMedications: [],
    medicationRelation: '',
    causes: ['Infection', 'Inflammatory or drug reaction'],
    investigationSignals: ['wbc', 'crp', 'lactate'],
    investigations: ['Cultures if febrile'],
    reviews: ['Lines, wounds and urinary catheter'],
    concernThreshold: 39,
    complication: 'sepsis',
  },
  'bicarbonate:low': {
    stateLabel: 'low bicarbonate',
    associatedMedications: [],
    medicationRelation: '',
    causes: ['Metabolic acidosis (renal, lactic, GI losses)'],
    investigationSignals: ['lactate', 'creatinine'],
    investigations: ['Blood gas with anion gap'],
    reviews: ['Renal function trend'],
    concernThreshold: 15,
    complication: 'significant acidosis',
  },
  'glucose:high': {
    stateLabel: 'hyperglycaemia',
    associatedMedications: ['steroid'],
    medicationRelation: 'raises glucose',
    causes: ['Diabetes / stress hyperglycaemia', 'Steroid effect'],
    investigationSignals: [],
    investigations: ['Capillary glucose monitoring'],
    reviews: ['Steroid dosing'],
    concernThreshold: 300,
    complication: 'hyperglycaemic crisis',
  },
  'glucose:low': {
    stateLabel: 'hypoglycaemia',
    associatedMedications: ['insulin'],
    medicationRelation: 'lowers glucose',
    causes: ['Insulin excess relative to intake'],
    investigationSignals: [],
    investigations: ['Capillary glucose monitoring'],
    reviews: ['Insulin dosing and oral intake'],
    concernThreshold: 54,
    complication: 'severe hypoglycaemia',
  },
  'inr:high': {
    stateLabel: 'rising INR',
    associatedMedications: ['anticoagulant', 'antibiotic'],
    medicationRelation: 'raises INR',
    causes: ['Anticoagulant effect', 'Liver dysfunction', 'Vitamin K deficiency'],
    investigationSignals: ['hemoglobin', 'platelets'],
    investigations: ['Liver function tests'],
    reviews: ['Anticoagulant dosing and interactions'],
    concernThreshold: 4.5,
    complication: 'bleeding',
  },
}

export function knowledgeFor(signal: SignalId, side: 'high' | 'low'): SignalKnowledge | undefined {
  return KNOWLEDGE[`${signal}:${side}`]
}

/* ------------------------------------------------------------------------------------ */
/* Multi-signal patterns                                                                 */
/* ------------------------------------------------------------------------------------ */

export interface PreventionTemplate {
  causes: string[]
  investigations: string[]
  reviews: string[]
  complicationToAvoid: string | null
}

export interface CompositeSpec {
  id: string
  title: string
  domain: ClinicalDomain
  /** Signals that define the pattern. */
  core: SignalId[]
  /** Signals that strengthen the pattern when moving concordantly. */
  supporting: SignalId[]
  /** Minimum number of core signals that must show a meaningful worsening trend. */
  minCore: number
  /** Minimum number of distinct clinical domains among the worsening signals (multisystem patterns). */
  minDomains?: number
  /** Medication classes that make the pattern more plausible (e.g. anticoagulation for bleeding). */
  contextMedications: MedicationClass[]
  medicationRelation: string
  /** If true the pattern is only emitted when a context medication is present. */
  requireContextMedication?: boolean
  /**
   * Composite ids this pattern may fold in when it is at least as severe and shares most of
   * their signals (`compositeOverlapToSubsume`). A composite that is not listed is only folded
   * in when every one of its signals is covered, so a pattern with a distinguishing signal
   * (e.g. haemoglobin for bleeding) is never hidden by a broader one that does not explain it.
   */
  subsumes?: string[]
  /** Investigations represented as signals: absence from the record is reported as missing information. */
  investigationSignals: SignalId[]
  prevention: PreventionTemplate
  horizonHighConcern: TimeHorizon
  horizonEmerging: TimeHorizon
}

export const COMPOSITE_SPECS: CompositeSpec[] = [
  {
    id: 'multisystem_deterioration',
    title: 'Multisystem deterioration',
    domain: 'multi_system',
    core: ['oxygen_lpm', 'respiratory_rate', 'spo2', 'systolic_bp', 'heart_rate', 'urine_output', 'creatinine', 'lactate'],
    supporting: ['temperature', 'wbc', 'crp', 'platelets', 'bicarbonate', 'urea'],
    minCore: 4,
    minDomains: 3,
    subsumes: ['hemodynamic_deterioration', 'renal_deterioration', 'respiratory_deterioration', 'inflammatory_escalation'],
    contextMedications: ['ace_inhibitor', 'arb', 'nsaid', 'antihypertensive', 'opioid', 'sedative'],
    medicationRelation: 'may blunt compensation or mask early deterioration',
    investigationSignals: ['lactate', 'creatinine', 'wbc', 'crp', 'hemoglobin'],
    prevention: {
      causes: [
        'Evolving sepsis (occult or inadequately controlled source)',
        'Hypovolaemia or haemorrhage',
        'Cardiogenic or pulmonary cause (fluid overload, embolism)',
        'Medication effect on haemodynamics or ventilation',
      ],
      investigations: ['Lactate and blood gas', 'Blood cultures and infection screen', 'Fluid balance and volume assessment', 'ECG and chest imaging'],
      reviews: ['Bedside reassessment sooner than the routine round', 'Escalation threshold and ceiling of care agreed with the team', 'RAAS blockers, NSAIDs and sedating medications'],
      complicationToAvoid: 'multi-organ dysfunction (shock, respiratory failure, acute kidney injury)',
    },
    horizonHighConcern: 'hours',
    horizonEmerging: 'next_24h',
  },
  {
    id: 'hemodynamic_deterioration',
    title: 'Progressive haemodynamic deterioration',
    domain: 'hemodynamic',
    core: ['systolic_bp', 'heart_rate', 'urine_output'],
    supporting: ['lactate', 'creatinine', 'respiratory_rate', 'temperature'],
    minCore: 2,
    contextMedications: ['ace_inhibitor', 'arb', 'antihypertensive', 'loop_diuretic', 'thiazide', 'opioid', 'sedative'],
    medicationRelation: 'may lower blood pressure or blunt compensation',
    investigationSignals: ['lactate', 'hemoglobin', 'creatinine'],
    prevention: {
      causes: ['Hypovolaemia (poor intake, losses, third-spacing)', 'Evolving sepsis', 'Bleeding', 'Medication-related hypotension', 'Cardiogenic cause'],
      investigations: ['Lactate', 'Haemoglobin', 'Fluid balance and volume assessment', 'ECG'],
      reviews: ['Antihypertensives and diuretics', 'Bedside perfusion assessment'],
      complicationToAvoid: 'shock',
    },
    horizonHighConcern: 'hours',
    horizonEmerging: 'next_24h',
  },
  {
    id: 'renal_deterioration',
    title: 'Evolving renal deterioration',
    domain: 'renal',
    core: ['creatinine', 'urea', 'urine_output'],
    supporting: ['potassium', 'bicarbonate', 'systolic_bp'],
    minCore: 2,
    contextMedications: ['nsaid', 'ace_inhibitor', 'arb', 'aminoglycoside', 'vancomycin', 'contrast', 'loop_diuretic'],
    medicationRelation: 'nephrotoxic or reduces renal perfusion',
    investigationSignals: ['urea', 'potassium', 'bicarbonate', 'urine_sodium'],
    prevention: {
      causes: ['Pre-renal (hypovolaemia, hypotension)', 'Nephrotoxic medication or contrast', 'Sepsis-associated kidney injury', 'Obstruction'],
      investigations: ['Fluid balance and volume assessment', 'Urinalysis', 'Renal tract imaging if obstruction possible', 'Potassium and bicarbonate'],
      reviews: ['Nephrotoxins and RAAS blockers', 'Renally dosed medications', 'Blood pressure trend'],
      complicationToAvoid: 'acute kidney injury with hyperkalaemia or fluid overload',
    },
    horizonHighConcern: 'next_24h',
    horizonEmerging: 'next_24_48h',
  },
  {
    id: 'respiratory_deterioration',
    title: 'Progressive respiratory deterioration',
    domain: 'respiratory',
    core: ['oxygen_lpm', 'respiratory_rate', 'spo2'],
    supporting: ['heart_rate', 'temperature', 'wbc', 'crp'],
    minCore: 2,
    contextMedications: ['opioid', 'sedative'],
    medicationRelation: 'can depress ventilation',
    investigationSignals: ['crp', 'wbc', 'lactate'],
    prevention: {
      causes: ['Progressing pneumonia', 'Fluid overload', 'Pulmonary embolism', 'Aspiration or atelectasis'],
      investigations: ['Chest imaging', 'Blood gas', 'Inflammatory markers'],
      reviews: ['Fluid balance', 'Sedating medications', 'Ceiling of respiratory support'],
      complicationToAvoid: 'respiratory failure requiring escalated support',
    },
    horizonHighConcern: 'hours',
    horizonEmerging: 'next_24h',
  },
  {
    id: 'occult_bleeding',
    title: 'Possible occult bleeding',
    domain: 'hematologic',
    core: ['hemoglobin', 'heart_rate', 'systolic_bp'],
    supporting: ['urine_output', 'lactate'],
    minCore: 2,
    subsumes: ['hemodynamic_deterioration'],
    contextMedications: ['anticoagulant', 'antiplatelet'],
    medicationRelation: 'increases bleeding risk',
    requireContextMedication: true,
    investigationSignals: ['inr', 'platelets', 'lactate'],
    prevention: {
      causes: ['GI bleeding', 'Procedural or retroperitoneal bleeding', 'Haemodilution (less likely with tachycardia)'],
      investigations: ['Repeat haemoglobin', 'Coagulation profile', 'Group and save'],
      reviews: ['Anticoagulant timing and dose', 'Stool, wound and drain inspection'],
      complicationToAvoid: 'haemorrhagic shock',
    },
    horizonHighConcern: 'hours',
    horizonEmerging: 'next_24h',
  },
  {
    id: 'inflammatory_escalation',
    title: 'Escalating inflammatory response',
    domain: 'infection',
    core: ['temperature', 'wbc', 'crp'],
    supporting: ['heart_rate', 'respiratory_rate', 'lactate', 'platelets'],
    minCore: 2,
    contextMedications: ['steroid'],
    medicationRelation: 'can mask fever or raise white cell count',
    investigationSignals: ['lactate', 'crp', 'wbc'],
    prevention: {
      causes: ['Unresolved or new infection', 'Line, wound or urinary source', 'Non-infectious inflammation'],
      investigations: ['Cultures', 'Source assessment', 'Lactate'],
      reviews: ['Antimicrobial cover and duration', 'Invasive devices'],
      complicationToAvoid: 'sepsis',
    },
    horizonHighConcern: 'next_24h',
    horizonEmerging: 'next_24_48h',
  },
]
