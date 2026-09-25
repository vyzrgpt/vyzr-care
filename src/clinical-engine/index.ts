/**
 * Public surface of the clinical intelligence engine.
 *
 *   import { assessPatient, PATIENTS } from '@/clinical-engine'
 *   const intelligence = assessPatient(PATIENTS[0])            // PatientIntelligence (JSON-safe)
 *   const replay = assessPatient(PATIENTS[0], { asOf: iso })   // same record, earlier instant
 */
export * from './types'
export { assessPatient, assessWard, severityRank, type AssessOptions } from './engine'
export { SIGNALS, SIGNAL_IDS, formatValue, formatWithUnit } from './signals'
export { ANALYSIS_CONFIG, IMPORTANCE_WEIGHTS, SEVERITY_THRESHOLDS } from './config'
export { KNOWLEDGE, COMPOSITE_SPECS, knowledgeFor } from './pattern-library'
export { normalizePatient, latestObservationTime } from './normalize'
export { analyseSeries } from './trends'
export { SEVERITY_LABEL, TRAJECTORY_LABEL, HORIZON_LABEL, relativeTime, formatHours } from './explanations'
export { PATIENTS, NOW, findPatient } from './demo-data/patients'
