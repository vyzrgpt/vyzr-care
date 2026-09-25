export type SignalId =
  | 'sodium'
  | 'potassium'
  | 'creatinine'
  | 'bicarbonate'
  | 'glucose'
  | 'hemoglobin'
  | 'platelets'
  | 'wbc'
  | 'crp'
  | 'lactate'
  | 'inr'
  | 'systolic_bp'
  | 'heart_rate'
  | 'respiratory_rate'
  | 'spo2'
  | 'oxygen_lpm'
  | 'temperature'
  | 'urine_output'
  | 'serum_osmolality'
  | 'urine_osmolality'
  | 'urine_sodium'
  | 'tsh'
  | 'cortisol'
  | 'urea'

export type Domain =
  | 'electrolyte'
  | 'renal'
  | 'respiratory'
  | 'hemodynamic'
  | 'hematologic'
  | 'infection'
  | 'metabolic'
  | 'endocrine'
  | 'multi_system'

export type WorseDirection = 'up' | 'down' | 'both'

export interface SignalDefinition {
  id: SignalId
  label: string
  shortLabel: string
  unit: string
  domain: Domain
  /** Reference range. Undefined bound means unbounded on that side. */
  low?: number
  high?: number
  /** Direction of change that is considered clinically worsening. */
  worse: WorseDirection
  /** Changes at or below this size are treated as measurement noise. */
  noise: number
  /** A clinically meaningful step for this signal; used to normalise magnitude and rate. */
  scale: number
  decimals: number
}

export interface Observation {
  signal: SignalId
  /** ISO timestamp */
  time: string
  value: number
}

export type MedicationClass =
  | 'thiazide'
  | 'loop_diuretic'
  | 'ssri'
  | 'anticonvulsant'
  | 'desmopressin'
  | 'nsaid'
  | 'ace_inhibitor'
  | 'arb'
  | 'aminoglycoside'
  | 'vancomycin'
  | 'contrast'
  | 'anticoagulant'
  | 'antiplatelet'
  | 'antihypertensive'
  | 'opioid'
  | 'sedative'
  | 'antibiotic'
  | 'insulin'
  | 'steroid'
  | 'bronchodilator'
  | 'other'

export interface MedicationEvent {
  name: string
  classes: MedicationClass[]
  time: string
  action: 'started' | 'stopped' | 'dose_changed' | 'continued'
  detail?: string
}

export type ClinicalEventKind =
  | 'admission'
  | 'procedure'
  | 'imaging'
  | 'microbiology'
  | 'nursing'
  | 'symptom'
  | 'note'

export interface ClinicalEvent {
  time: string
  kind: ClinicalEventKind
  description: string
}

export interface Patient {
  id: string
  name: string
  age: number
  sex: 'F' | 'M'
  bed: string
  admissionTime: string
  admittingDiagnosis: string
  problems: string[]
  /** Known pre-admission baselines for chronic abnormalities. */
  baselines: Partial<Record<SignalId, number>>
  observations: Observation[]
  medications: MedicationEvent[]
  events: ClinicalEvent[]
  /** One-line description of the scenario this synthetic patient demonstrates. */
  scenario: string
}

export type Severity = 'stable' | 'informational' | 'watch' | 'concerning' | 'urgent'

export const SEVERITY_ORDER: Severity[] = ['stable', 'informational', 'watch', 'concerning', 'urgent']

export type Trajectory =
  | 'stable'
  | 'minor_change'
  | 'watching'
  | 'progressively_worsening'
  | 'rapidly_worsening'
  | 'improving'
  | 'possible_emerging_pattern'
  | 'high_concern_pattern'

export type Horizon = 'hours' | 'next_24h' | 'next_24_48h'

export type Direction = 'up' | 'down' | 'flat'

export interface SeriesAnalysis {
  signal: SignalDefinition
  points: Observation[]
  latest: number
  latestTime: string
  previous: number | null
  spanHours: number
  abnormal: 'high' | 'low' | null
  /** Distance outside the reference range in units of `scale` (0 when within range). */
  magnitude: number
  deltaPrevious: number | null
  baseline: number
  baselineSource: 'chronic' | 'admission'
  deltaBaseline: number
  relativeDeltaBaseline: number
  velocityPerDay: number | null
  accelerationPerDay: number | null
  /** Direction of the most recent change beyond noise. */
  direction: Direction
  /** Consecutive intervals (from the latest backwards) moving in `direction`. */
  persistence: number
  /** Absolute change accumulated over the persistent run. */
  runChange: number
  /** Latest move reverses a preceding run of two or more intervals. */
  reversal: boolean
  worsening: boolean
  improving: boolean
  /** Currently within range but projected to leave it within 24h at current velocity. */
  approachingAbnormal: boolean
  projected24h: number | null
  /** Abnormal, but consistent with a known chronic baseline. */
  chronicStable: boolean
  everAbnormal: boolean
}

export interface ImportanceComponents {
  magnitude: number
  rateOfChange: number
  persistence: number
  acceleration: number
  crossVariableAgreement: number
  context: number
  novelty: number
  chronicBaseline: number
  treatmentResponse: number
  noise: number
}

export interface ImportanceBreakdown {
  components: ImportanceComponents
  /** weight × component for each entry */
  contributions: Record<keyof ImportanceComponents, number>
  total: number
}

export interface SignalEvidence {
  kind: 'series'
  signal: SignalId
  values: { time: string; value: number }[]
  direction: Direction
  deltaBaseline: number
  velocityPerDay: number | null
  abnormal: 'high' | 'low' | null
  role: 'core' | 'supporting'
}

export interface MedicationEvidence {
  kind: 'medication'
  medication: MedicationEvent
  relation: string
}

export interface EventEvidence {
  kind: 'event'
  event: ClinicalEvent
}

export type Evidence = SignalEvidence | MedicationEvidence | EventEvidence

export interface MissingInformation {
  label: string
  reason: string
}

export interface PreventionContent {
  causes: string[]
  investigations: string[]
  reviews: string[]
  complicationToAvoid: string | null
}

export type PatternKind =
  | 'single_trend'
  | 'chronic_stable'
  | 'composite_deterioration'
  | 'composite_recovery'

export interface Finding {
  id: string
  patientId: string
  ruleId: string
  kind: PatternKind
  title: string
  domain: Domain
  severity: Severity
  trajectory: Trajectory
  horizon: Horizon | null
  /** Signals whose analysis produced this finding. */
  signals: SignalId[]
  primarySignal: SignalId | null
  evidence: Evidence[]
  missing: MissingInformation[]
  prevention: PreventionContent
  importance: ImportanceBreakdown
  /** Set when the finding is deliberately not surfaced as an alert. */
  suppressedReason: string | null
  /** Linear extrapolation used for the time-horizon estimate, if any. */
  projection: { signal: SignalId; value24h: number; threshold: number | null; hoursToThreshold: number | null } | null
  /** Primary series analysis for the card (latest value, etc). */
  series: SeriesAnalysis[]
}

export interface QuietSignal {
  signal: SignalId
  latest: number
  reason: string
}

export interface PatientAssessment {
  patient: Patient
  asOf: string
  findings: Finding[]
  quiet: QuietSignal[]
  overallSeverity: Severity
  headline: Finding | null
  series: Partial<Record<SignalId, SeriesAnalysis>>
}
