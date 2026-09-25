import type { ImportanceComponents, Severity } from './types'

/**
 * Transparent, configurable weights for the importance model.
 *
 *   importance = magnitude + rate of change + persistence + acceleration
 *              + cross-variable agreement + context + novelty
 *              − chronic baseline − treatment response − noise
 *
 * These are deterministic demonstration weights, not clinically validated parameters.
 */
export const IMPORTANCE_WEIGHTS: Record<keyof ImportanceComponents, number> = {
  magnitude: 1.0,
  rateOfChange: 1.0,
  persistence: 0.5,
  acceleration: 0.5,
  crossVariableAgreement: 0.3,
  context: 0.5,
  novelty: 0.5,
  chronicBaseline: -2.0,
  treatmentResponse: -1.5,
  noise: -1.0,
}

/** Minimum importance score for each severity band (ascending). */
export const SEVERITY_THRESHOLDS: { severity: Severity; min: number }[] = [
  { severity: 'urgent', min: 8.0 },
  { severity: 'concerning', min: 4.5 },
  { severity: 'watch', min: 2.5 },
  { severity: 'informational', min: 0.75 },
  { severity: 'stable', min: -Infinity },
]

export const ANALYSIS_CONFIG = {
  /** Component values are capped so a single dimension cannot dominate. */
  componentCap: 3,
  /** Rate (in scale units/day) at or above which a persistent trend is "rapidly worsening". */
  rapidRatePerDay: 1.2,
  /** Run change (in scale units) needed before a persistent move counts as a progressive trend. */
  progressiveRunScale: 1.0,
  /** Run change (in scale units) needed before a move is worth watching rather than "minor change". */
  watchRunScale: 0.8,
  /** Multiple of `noise` within which an abnormal value is considered consistent with its chronic baseline. */
  chronicToleranceNoiseMultiple: 2,
  /** Medication changes within this window are considered "recent" context. */
  recentMedicationHours: 96,
  /** Clinical events within this window are attached as context. */
  recentEventHours: 48,
}
