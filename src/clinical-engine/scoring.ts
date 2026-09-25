import { ANALYSIS_CONFIG, IMPORTANCE_WEIGHTS, SEVERITY_THRESHOLDS } from './config'
import type { ImportanceBreakdown, ImportanceComponents, Severity } from './types'

export const EMPTY_COMPONENTS: ImportanceComponents = {
  magnitude: 0,
  rateOfChange: 0,
  persistence: 0,
  acceleration: 0,
  crossVariableAgreement: 0,
  context: 0,
  novelty: 0,
  chronicBaseline: 0,
  treatmentResponse: 0,
  noise: 0,
}

export function cap(value: number): number {
  return Math.min(ANALYSIS_CONFIG.componentCap, Math.max(0, value))
}

export function scoreImportance(partial: Partial<ImportanceComponents>): ImportanceBreakdown {
  const components: ImportanceComponents = { ...EMPTY_COMPONENTS, ...partial }
  const contributions = {} as Record<keyof ImportanceComponents, number>
  let total = 0
  for (const key of Object.keys(IMPORTANCE_WEIGHTS) as (keyof ImportanceComponents)[]) {
    const c = IMPORTANCE_WEIGHTS[key] * components[key]
    contributions[key] = c
    total += c
  }
  return { components, contributions, total: Math.round(total * 100) / 100 }
}

export function severityFromScore(total: number): Severity {
  for (const band of SEVERITY_THRESHOLDS) {
    if (total >= band.min) return band.severity
  }
  return 'stable'
}
