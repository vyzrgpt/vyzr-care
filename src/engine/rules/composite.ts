import { hasImprovingTrend, hasMeaningfulWorsening, hasWorseningTrend } from '../analytics'
import { cap, scoreImportance, severityFromScore } from '../scoring'
import type {
  Domain,
  Evidence,
  Finding,
  Horizon,
  ImportanceComponents,
  MedicationClass,
  PreventionContent,
  SeriesAnalysis,
  Severity,
  SignalId,
  Trajectory,
} from '../types'
import {
  associatedMedications,
  eventEvidence,
  isNewlyAbnormal,
  medicationEvidence,
  missingSignals,
  seriesEvidence,
  type RuleContext,
} from './context'

export interface CompositeSpec {
  id: string
  title: string
  domain: Domain
  /** Signals that define the pattern. */
  core: SignalId[]
  /** Signals that strengthen the pattern when moving concordantly. */
  supporting: SignalId[]
  /** Minimum number of core signals that must show a worsening trend. */
  minCore: number
  /** Medication classes that make the pattern more plausible (e.g. anticoagulation for bleeding). */
  contextMedications: MedicationClass[]
  medicationRelation: string
  /** If true the pattern is only emitted when a context medication is present. */
  requireContextMedication?: boolean
  investigationSignals: SignalId[]
  prevention: PreventionContent
  horizonHighConcern: Horizon
  horizonEmerging: Horizon
}

export const COMPOSITE_SPECS: CompositeSpec[] = [
  {
    id: 'hypoperfusion_pattern',
    title: 'Concordant haemodynamic–renal decline',
    domain: 'multi_system',
    core: ['systolic_bp', 'urine_output', 'creatinine'],
    supporting: ['heart_rate', 'respiratory_rate', 'oxygen_lpm', 'temperature', 'wbc', 'lactate', 'spo2'],
    minCore: 2,
    contextMedications: ['ace_inhibitor', 'arb', 'nsaid', 'antihypertensive', 'loop_diuretic', 'thiazide'],
    medicationRelation: 'may blunt compensation or impair renal perfusion',
    investigationSignals: ['lactate', 'creatinine', 'urine_output', 'hemoglobin', 'wbc', 'crp'],
    prevention: {
      causes: [
        'Evolving sepsis (occult source, inadequate source control)',
        'Hypovolaemia (poor intake, losses, third-spacing)',
        'Medication-related hypotension and renal hypoperfusion',
        'Cardiogenic cause or bleeding',
      ],
      investigations: ['Lactate', 'Blood cultures and infection screen', 'Fluid balance and volume assessment', 'ECG'],
      reviews: ['Antihypertensives, RAAS blockers and NSAIDs', 'Bedside reassessment sooner than the routine round', 'Escalation threshold agreed with the team'],
      complicationToAvoid: 'shock with acute kidney injury',
    },
    horizonHighConcern: 'hours',
    horizonEmerging: 'next_24h',
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

function maxSeverity(a: Severity, b: Severity): Severity {
  const order: Severity[] = ['stable', 'informational', 'watch', 'concerning', 'urgent']
  return order.indexOf(a) >= order.indexOf(b) ? a : b
}

function worseningSeries(ctx: RuleContext, ids: SignalId[]): SeriesAnalysis[] {
  return ids
    .map((id) => ctx.series[id])
    .filter((s): s is SeriesAnalysis => !!s && !s.chronicStable && hasMeaningfulWorsening(s))
}

export function evaluateComposite(ctx: RuleContext, spec: CompositeSpec): Finding | null {
  const coreHits = worseningSeries(ctx, spec.core)
  if (coreHits.length < spec.minCore) return null
  const meds = associatedMedications(ctx, spec.contextMedications)
  if (spec.requireContextMedication && meds.length === 0) return null

  const supportingHits = worseningSeries(ctx, spec.supporting)
  const allHits = [...coreHits, ...supportingHits]

  const rates = allHits.map((s) => (s.velocityPerDay !== null ? Math.abs(s.velocityPerDay) / s.signal.scale : 0))
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  // Mean (not max) across the concordant signals: a pattern of many mild moves scores through
  // agreement, while a single very abnormal value is handled by its own single-signal finding.
  const components: Partial<ImportanceComponents> = {
    magnitude: cap(mean(allHits.map((s) => s.magnitude))),
    rateOfChange: cap(mean(rates)),
    persistence: Math.min(3, Math.max(...allHits.map((s) => s.persistence))),
    crossVariableAgreement: coreHits.length + supportingHits.length,
    context: Math.min(2, meds.length),
    novelty: Math.min(1.5, allHits.filter(isNewlyAbnormal).length + allHits.filter((s) => s.approachingAbnormal).length * 0.5),
  }
  const importance = scoreImportance(components)

  const fullCore = coreHits.length === spec.core.length
  const trajectory: Trajectory =
    fullCore && supportingHits.length >= 2 ? 'high_concern_pattern' : 'possible_emerging_pattern'
  let severity = severityFromScore(importance.total)
  if (trajectory === 'high_concern_pattern') severity = maxSeverity(severity, 'concerning')
  else severity = maxSeverity(severity, 'watch')

  const evidence: Evidence[] = [
    ...coreHits.map((s) => seriesEvidence(s, 'core')),
    ...supportingHits.map((s) => seriesEvidence(s, 'supporting')),
    ...medicationEvidence(meds, spec.medicationRelation),
    ...eventEvidence(ctx, ['symptom', 'nursing', 'microbiology', 'imaging']),
  ]

  return {
    id: `${ctx.patient.id}:${spec.id}`,
    patientId: ctx.patient.id,
    ruleId: spec.id,
    kind: 'composite_deterioration',
    title: spec.title,
    domain: spec.domain,
    severity,
    trajectory,
    horizon: trajectory === 'high_concern_pattern' ? spec.horizonHighConcern : spec.horizonEmerging,
    signals: allHits.map((s) => s.signal.id),
    primarySignal: coreHits[0].signal.id,
    evidence,
    missing: missingSignals(ctx, spec.investigationSignals),
    prevention: spec.prevention,
    importance,
    suppressedReason: null,
    projection: null,
    series: allHits,
  }
}

export const RECOVERY_RULE_ID = 'multi_signal_recovery'

/** Three or more previously abnormal signals improving with nothing worsening. */
export function evaluateRecovery(ctx: RuleContext): Finding | null {
  const all = Object.values(ctx.series).filter((s): s is SeriesAnalysis => !!s)
  const worsening = all.filter((s) => !s.chronicStable && hasWorseningTrend(s))
  const improving = all.filter((s) => !s.chronicStable && hasImprovingTrend(s) && !hasWorseningTrend(s))
  if (improving.length < 3 || worsening.length > 0) return null

  const treatments = ctx.activeMedications.filter((m) => m.action === 'started')
  const importance = scoreImportance({
    magnitude: cap(Math.max(...improving.map((s) => s.magnitude))),
    treatmentResponse: Math.min(3, improving.length),
  })
  return {
    id: `${ctx.patient.id}:${RECOVERY_RULE_ID}`,
    patientId: ctx.patient.id,
    ruleId: RECOVERY_RULE_ID,
    kind: 'composite_recovery',
    title: 'Improving across multiple signals',
    domain: 'multi_system',
    severity: 'informational',
    trajectory: 'improving',
    horizon: null,
    signals: improving.map((s) => s.signal.id),
    primarySignal: improving[0].signal.id,
    evidence: [
      ...improving.map((s) => seriesEvidence(s, 'core')),
      ...medicationEvidence(treatments, 'treatment in progress'),
    ],
    missing: [],
    prevention: {
      causes: [],
      investigations: [],
      reviews: ['Continue current plan', 'Consider de-escalation (oxygen, monitoring frequency) as appropriate', 'Reassess if any signal reverses'],
      complicationToAvoid: null,
    },
    importance,
    suppressedReason: null,
    projection: null,
    series: improving,
  }
}
