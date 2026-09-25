import { analyseSeries } from './analytics'
import { SIGNAL_IDS } from './signals'
import type { Finding, Patient, PatientAssessment, QuietSignal, SeriesAnalysis, Severity, SignalId } from './types'
import { SEVERITY_ORDER } from './types'
import { COMPOSITE_SPECS, evaluateComposite, evaluateRecovery } from './rules/composite'
import { buildContext } from './rules/context'
import { evaluateTrend } from './rules/trend'

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s)
}

export function latestObservationTime(patients: Patient[]): string {
  let max = 0
  for (const p of patients) for (const o of p.observations) max = Math.max(max, new Date(o.time).getTime())
  return new Date(max).toISOString()
}

export function assessPatient(patient: Patient, asOf: string): PatientAssessment {
  const series: Partial<Record<SignalId, SeriesAnalysis>> = {}
  for (const id of SIGNAL_IDS) {
    const s = analyseSeries(patient, id, asOf)
    if (s) series[id] = s
  }
  const ctx = buildContext(patient, asOf, series)

  const single: Finding[] = []
  const quiet: QuietSignal[] = []
  for (const id of SIGNAL_IDS) {
    const s = series[id]
    if (!s) continue
    const f = evaluateTrend(ctx, s)
    if (f) single.push(f)
    else quiet.push({ signal: id, latest: s.latest, reason: 'Within range, no movement beyond noise' })
  }

  const allComposites: Finding[] = []
  for (const spec of COMPOSITE_SPECS) {
    const f = evaluateComposite(ctx, spec)
    if (f) allComposites.push(f)
  }
  // A composite whose signals are all contained in a broader composite of equal or higher
  // severity adds no new information; keep only the broader pattern.
  const composites = allComposites.filter(
    (c) =>
      !allComposites.some(
        (other) =>
          other !== c &&
          other.signals.length > c.signals.length &&
          c.signals.every((id) => other.signals.includes(id)) &&
          severityRank(other.severity) >= severityRank(c.severity),
      ),
  )
  const recovery = evaluateRecovery(ctx)
  if (recovery) composites.push(recovery)

  // Fold single-signal findings into a composite that already explains them.
  const absorbed = new Set<string>()
  for (const c of composites) {
    for (const f of single) {
      if (f.primarySignal && c.signals.includes(f.primarySignal) && severityRank(f.severity) <= severityRank(c.severity)) {
        absorbed.add(f.id)
      }
    }
  }
  const findings = [...composites, ...single.filter((f) => !absorbed.has(f.id))].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || b.importance.total - a.importance.total,
  )

  const active = findings.filter((f) => !f.suppressedReason)
  const overallSeverity = active.reduce<Severity>(
    (acc, f) => (severityRank(f.severity) > severityRank(acc) ? f.severity : acc),
    'stable',
  )
  const headline = active.find((f) => f.severity !== 'stable') ?? active[0] ?? null

  return { patient, asOf, findings, quiet, overallSeverity, headline, series }
}

export function assessWard(patients: Patient[], asOf: string): PatientAssessment[] {
  return patients
    .map((p) => assessPatient(p, asOf))
    .sort((a, b) => severityRank(b.overallSeverity) - severityRank(a.overallSeverity))
}
