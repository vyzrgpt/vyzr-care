/**
 * Clinical-engine types.
 *
 * Three groups:
 *   1. INPUT  — a clean longitudinal observation model (`ClinicalObservation`, `PatientRecord`)
 *               that a future FHIR/EHR adapter could populate.
 *   2. INTERNAL — per-signal temporal analysis (`SeriesAnalysis`) and importance arithmetic.
 *   3. OUTPUT — the frontend contract (`PatientIntelligence`, `RecognizedPattern`, …).
 *               JSON-serialisable; contains no presentation markup.
 */

/* ------------------------------------------------------------------------------------ */
/* 1. INPUT MODEL                                                                        */
/* ------------------------------------------------------------------------------------ */

export type SignalId =
  | 'sodium'
  | 'potassium'
  | 'creatinine'
  | 'urea'
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

export type ClinicalDomain =
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

export interface ReferenceRange {
  low?: number
  high?: number
}

export interface SignalDefinition {
  id: SignalId
  label: string
  shortLabel: string
  unit: string
  domain: ClinicalDomain
  /** Numeric category used when normalising raw observations. */
  category: NumericCategory
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

export type NumericCategory = 'lab' | 'vital' | 'oxygen' | 'intake_output'

export type EventCategory =
  | 'symptom'
  | 'nursing'
  | 'imaging'
  | 'microbiology'
  | 'procedure'
  | 'note'
  | 'clinical_event'

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
  | 'iv_fluid'
  | 'other'

export type MedicationAction = 'started' | 'stopped' | 'dose_changed' | 'continued'

interface ObservationBase {
  /** Stable identifier for the observation (used in evidence references). */
  id: string
  patientId: string
  /** ISO-8601 timestamp of the observation. */
  time: string
  /** Free-form source metadata (device, order id, author…). Never used for reasoning. */
  meta?: Record<string, string>
}

/** A measured quantity: lab, vital sign, oxygen requirement, or intake/output. */
export interface NumericObservation extends ObservationBase {
  category: NumericCategory
  /** Canonical measurement code; maps to a `SignalDefinition`. */
  code: SignalId
  /** Display name as recorded by the source system (defaults to the signal label). */
  name?: string
  value: number
  unit: string
  /**
   * Reference range supplied by the source, in the same unit as `value`. When present on the
   * most recent observation of a series it overrides the registry range for that series.
   * Converted to the registry unit alongside `value`.
   */
  referenceRange?: ReferenceRange
}

export interface MedicationObservation extends ObservationBase {
  category: 'medication'
  name: string
  classes: MedicationClass[]
  action: MedicationAction
  detail?: string
}

/** Symptom, nursing observation, imaging finding, microbiology result, procedure, note or event. */
export interface EventObservation extends ObservationBase {
  category: EventCategory
  description: string
}

export type ClinicalObservation = NumericObservation | MedicationObservation | EventObservation

export interface PatientRecord {
  patientId: string
  name: string
  age: number
  sex: 'F' | 'M'
  location: string
  admissionTime: string
  admittingDiagnosis: string
  problems: string[]
  /** Known pre-admission baselines for chronic abnormalities (e.g. creatinine in CKD). */
  knownBaselines: Partial<Record<SignalId, number>>
  /** The complete longitudinal timeline, any order. */
  timeline: ClinicalObservation[]
  /** Demo-only description of what this synthetic patient is meant to show. */
  scenario?: string
}

/* ------------------------------------------------------------------------------------ */
/* 2. INTERNAL ANALYSIS                                                                  */
/* ------------------------------------------------------------------------------------ */

export type Direction = 'up' | 'down' | 'flat'

export interface SeriesPoint {
  observationId: string
  time: string
  /** Value in the registry unit for the signal. */
  value: number
  /** Source-supplied reference range, converted to the registry unit, when present. */
  referenceRange?: ReferenceRange
}

export interface SeriesAnalysis {
  signal: SignalDefinition
  points: SeriesPoint[]
  latest: number
  latestTime: string
  /** Age of the latest measurement at the assessment instant (`asOf`). */
  hoursSinceLatest: number
  previous: number | null
  spanHours: number
  abnormal: 'high' | 'low' | null
  /** Distance outside the reference range in units of `scale` (0 when within range). */
  magnitude: number
  deltaPrevious: number | null
  /** deltaPrevious / previous, when previous is non-zero. */
  relativeDeltaPrevious: number | null
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

/* ------------------------------------------------------------------------------------ */
/* 3. OUTPUT CONTRACT                                                                    */
/* ------------------------------------------------------------------------------------ */

/** Attention state of a pattern or patient. `minor` = abnormal / changed but not alert-worthy. */
export type Severity = 'stable' | 'minor' | 'watch' | 'concerning' | 'urgent'
export const SEVERITY_ORDER: Severity[] = ['stable', 'minor', 'watch', 'concerning', 'urgent']

/** Interpretable trajectory of a pattern. */
export type Trajectory = 'improving' | 'stable' | 'minor_change' | 'worsening' | 'rapidly_worsening'
/** Patient-level trajectory. */
export type OverallTrajectory = 'improving' | 'stable' | 'worsening' | 'rapidly_worsening'

export type ConfidenceLevel = 'low' | 'moderate' | 'high'
export type TimeHorizon = 'hours' | 'next_24h' | 'next_24_48h'

export type PatternKind =
  | 'single_signal_trend'
  | 'chronic_stable_abnormality'
  | 'multi_signal_deterioration'
  | 'multi_signal_recovery'

export interface SeriesEvidence {
  kind: 'series'
  signal: SignalId
  label: string
  unit: string
  role: 'core' | 'supporting'
  /** Every observation that contributed, in time order. */
  values: SeriesPoint[]
  direction: Direction
  deltaPrevious: number | null
  deltaBaseline: number
  velocityPerDay: number | null
  abnormal: 'high' | 'low' | null
  /** Human-readable, e.g. "138 → 134 → 130 → 127 mmol/L". */
  summary: string
}

export interface MedicationEvidence {
  kind: 'medication'
  observationId: string
  name: string
  classes: MedicationClass[]
  action: MedicationAction
  time: string
  /** How this medication relates to the pattern, e.g. "can lower sodium". */
  relation: string
  detail?: string
}

export interface EventEvidence {
  kind: 'event'
  observationId: string
  category: EventCategory
  time: string
  description: string
}

export type Evidence = SeriesEvidence | MedicationEvidence | EventEvidence

export interface MissingInformation {
  label: string
  reason: string
  /** Signal that would fill the gap, when it is a measurable one. */
  signal: SignalId | null
}

export interface Recognition {
  headline: string
  explanation: string
  /** e.g. "progressive decline", "concordant multi-domain worsening", "stable at baseline". */
  detectedTrend: string
  /** Sentences describing exactly what was observed, one per evidence item. */
  supportingObservations: string[]
}

export interface Prediction {
  trajectory: Trajectory
  timeHorizon: TimeHorizon | null
  plausibleNextConcern: string | null
  /** One or two concise physician-facing sentences. */
  statement: string
  reasoning: string[]
  uncertainty: string[]
  /** Linear extrapolation behind the horizon, when one was computed. Extrapolation, not a model. */
  projection: {
    signal: SignalId
    /** Age of the measurement the extrapolation starts from, at `asOf`. */
    measuredHoursAgo: number
    /** Value 24 h after the latest measurement at the latest rate. */
    value24h: number
    threshold: number | null
    /**
     * Hours from `asOf` until `threshold` at the latest rate. 0 when the threshold is already
     * crossed (`thresholdStatus: 'crossed'`) or when the extrapolated crossing time has already
     * passed without a newer measurement (`thresholdStatus: 'overdue'`).
     */
    hoursToThreshold: number | null
    thresholdStatus: 'ahead' | 'crossed' | 'overdue' | null
  } | null
}

export interface Prevention {
  /** One or two concise physician-facing sentences. */
  statement: string
  causesToConsider: string[]
  contextualFactors: string[]
  investigationsToConsider: string[]
  missingInformation: MissingInformation[]
  reassessmentPoints: string[]
  complicationToAvoid: string | null
}

export interface RecognizedPattern {
  id: string
  patternId: string
  kind: PatternKind
  clinicalDomain: ClinicalDomain
  title: string
  severity: Severity
  trajectory: Trajectory
  confidenceLevel: ConfidenceLevel
  recognition: Recognition
  prediction: Prediction
  prevention: Prevention
  evidence: Evidence[]
  causesToConsider: string[]
  investigationsToConsider: string[]
  missingInformation: MissingInformation[]
  timeHorizon: TimeHorizon | null
  interruptiveAlertJustified: boolean
  /** Signals whose analysis produced this pattern. */
  signals: SignalId[]
  /** Transparent arithmetic behind the severity. */
  importance: ImportanceBreakdown
  /** Set when the pattern is deliberately kept quiet (e.g. chronic baseline). */
  suppressedReason: string | null
  /** Ids of single-signal patterns folded into this one because it already explains them. */
  absorbedPatternIds: string[]
}

export interface ReassuringSignal {
  signal: SignalId
  label: string
  latest: number
  unit: string
  /** Why this is not being raised. */
  reason: string
  status: 'within_range' | 'abnormal_but_stable' | 'chronic_baseline' | 'improving'
}

export interface ChangedSignal {
  signal: SignalId
  label: string
  unit: string
  previous: number
  latest: number
  delta: number
  direction: Direction
  time: string
  /** Whether this change contributes to any recognized pattern. */
  partOfPattern: boolean
}

export interface PatientIntelligence {
  patientId: string
  generatedAt: string
  /** Assessment time; observations after this instant are ignored (enables replay). */
  asOf: string
  overallTrajectory: OverallTrajectory
  overallAttentionState: Severity
  oneLineSummary: string
  changedSinceLastReview: ChangedSignal[]
  recognizedPatterns: RecognizedPattern[]
  reassuringSignals: ReassuringSignal[]
  /** Patterns deliberately not surfaced (chronic-stable abnormalities); kept for inspection. */
  suppressedPatterns: RecognizedPattern[]
  /** Per-signal analysis for charting. */
  series: Partial<Record<SignalId, SeriesAnalysis>>
}
