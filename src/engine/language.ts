/**
 * Language layer: converts structured findings into concise physician-facing text.
 * It never adds clinical facts, probabilities, or changes severity — every sentence is
 * derived from fields the engine populated.
 */
import { hoursBetween } from './analytics'
import { knowledgeFor } from './knowledge'
import { SIGNALS, formatValue } from './signals'
import type {
  Evidence,
  Finding,
  Horizon,
  MedicationEvidence,
  Patient,
  SeriesAnalysis,
  Severity,
  SignalEvidence,
  Trajectory,
} from './types'

export const SEVERITY_LABEL: Record<Severity, string> = {
  stable: 'Stable',
  informational: 'Informational',
  watch: 'Watch',
  concerning: 'Concerning',
  urgent: 'Urgent',
}

export const TRAJECTORY_LABEL: Record<Trajectory, string> = {
  stable: 'Stable',
  minor_change: 'Minor change',
  watching: 'Watching',
  progressively_worsening: 'Progressively worsening',
  rapidly_worsening: 'Rapidly worsening',
  improving: 'Improving',
  possible_emerging_pattern: 'Possible emerging pattern',
  high_concern_pattern: 'High-concern pattern',
}

export const HORIZON_LABEL: Record<Horizon, string> = {
  hours: 'hours',
  next_24h: 'next 24 hours',
  next_24_48h: 'next 24–48 hours',
}

export interface FindingText {
  recognition: string
  prediction: string
  prevention: string
  observed: string[]
  inferred: string[]
  uncertain: string[]
}

export function relativeTime(admission: string, time: string): string {
  const h = hoursBetween(admission, time)
  const day = Math.floor(h / 24)
  const hh = Math.round(h - day * 24)
  return `Day ${day} ${String(hh).padStart(2, '0')}:00`
}

export function formatHours(h: number): string {
  if (h < 1) return '<1 h'
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} d`
}

function signed(value: number, decimals: number): string {
  const s = value.toFixed(decimals)
  return value > 0 ? `+${s}` : s
}

function arrowSeries(s: SeriesAnalysis, maxPoints = 6): string {
  const pts = s.points.length > maxPoints ? [s.points[0], ...s.points.slice(-(maxPoints - 1))] : s.points
  const values = pts.map((p) => formatValue(s.signal.id, p.value))
  const joined = s.points.length > maxPoints ? `${values[0]} → … → ${values.slice(1).join(' → ')}` : values.join(' → ')
  return `${joined}${s.signal.unit ? ` ${s.signal.unit}` : ''}`
}

function endpoints(s: SeriesAnalysis): string {
  const def = s.signal
  const first = formatValue(def.id, s.points[0].value)
  const last = formatValue(def.id, s.latest)
  return `${def.shortLabel} ${first} → ${last}${def.unit ? ` ${def.unit}` : ''}`
}

function directionWord(s: SeriesAnalysis): string {
  return s.deltaBaseline > 0 ? 'rise' : 'decline'
}

function ratePerDay(s: SeriesAnalysis): string | null {
  if (s.velocityPerDay === null) return null
  const def = s.signal
  return `≈${Math.abs(s.velocityPerDay).toFixed(def.decimals)} ${def.unit}/day`.replace('  ', ' ')
}

function isSeries(e: Evidence): e is SignalEvidence {
  return e.kind === 'series'
}
function isMedication(e: Evidence): e is MedicationEvidence {
  return e.kind === 'medication'
}

function seriesSpan(series: SeriesAnalysis[]): number {
  return Math.max(...series.map((s) => s.spanHours))
}

/* ---------------------------------- Recognition ---------------------------------- */

function recognition(f: Finding): string {
  const s = f.series[0]
  switch (f.kind) {
    case 'chronic_stable': {
      const def = s.signal
      return `${def.label} ${formatValue(def.id, s.latest)} ${def.unit}: outside the reference range but unchanged from the known baseline of ${formatValue(def.id, s.baseline)} across ${formatHours(s.spanHours)} of observation.`
    }
    case 'composite_recovery': {
      const parts = f.series.map(endpoints).join(', ')
      return `${f.series.length} previously abnormal signals are improving together over ${formatHours(seriesSpan(f.series))}: ${parts}.`
    }
    case 'composite_deterioration': {
      const core = f.evidence.filter(isSeries).filter((e) => e.role === 'core')
      const supporting = f.evidence.filter(isSeries).filter((e) => e.role === 'supporting')
      const coreText = core
        .map((e) => f.series.find((x) => x.signal.id === e.signal))
        .filter((x): x is SeriesAnalysis => !!x)
        .map(endpoints)
        .join(', ')
      const supText = supporting
        .map((e) => `${SIGNALS[e.signal].shortLabel} ${e.direction === 'up' ? '↑' : '↓'}`)
        .join(', ')
      const allMild = f.series.every((x) => x.magnitude < 0.5)
      return (
        `${f.series.length} signals moving in the same direction over ${formatHours(seriesSpan(f.series))}: ${coreText}` +
        (supText ? `; also ${supText}.` : '.') +
        (allMild ? ' No single value has crossed a conventional alarm threshold.' : '')
      )
    }
    case 'single_trend': {
      const def = s.signal
      if (f.trajectory === 'improving') {
        const inRange = s.abnormal === null ? ', now within range' : ''
        return `${def.label} improving over ${formatHours(s.spanHours)}: ${arrowSeries(s)}${inRange}.`
      }
      const fromAdmission = `${signed(s.deltaBaseline, def.decimals)} from ${s.baselineSource === 'chronic' ? 'baseline' : 'admission'}`
      const last = s.deltaPrevious !== null ? `; ${signed(s.deltaPrevious, def.decimals)} since the previous measurement` : ''
      if (f.trajectory === 'rapidly_worsening' || f.trajectory === 'progressively_worsening') {
        const adj = f.trajectory === 'rapidly_worsening' ? 'Rapid, sustained' : 'Progressive'
        return `${adj} ${def.label.toLowerCase()} ${directionWord(s)} over ${formatHours(s.spanHours)}: ${arrowSeries(s)} (${fromAdmission}${last}).`
      }
      if (f.trajectory === 'watching') {
        const approach = s.approachingAbnormal ? ' Still within range, but moving toward the limit.' : ''
        return `${def.label} ${s.direction === 'up' ? 'rising' : 'falling'}: ${arrowSeries(s)} (${fromAdmission}${last}).${approach}`
      }
      const mild = s.abnormal ? `Mildly ${s.abnormal} ${def.label.toLowerCase()}` : def.label
      const trendWord = s.direction === 'flat' ? 'essentially unchanged' : `${s.direction === 'up' ? 'small upward' : 'small downward'} drift`
      return `${mild}, ${trendWord}: ${arrowSeries(s)} over ${formatHours(s.spanHours)} (${fromAdmission}${last}).`
    }
  }
}

/* ----------------------------------- Prediction ---------------------------------- */

function prediction(f: Finding): string {
  const s = f.series[0]
  switch (f.kind) {
    case 'chronic_stable':
      return 'No new trajectory. This value is behaving as expected for this patient; no deterioration is signalled by it.'
    case 'composite_recovery':
      return 'Trajectory consistent with response to treatment. Continued improvement is plausible if no new insult occurs.'
    case 'composite_deterioration': {
      const horizon = f.horizon ? HORIZON_LABEL[f.horizon] : 'coming day'
      if (f.trajectory === 'high_concern_pattern') {
        return `Concordant movement across ${domainsOf(f)} is the kind of trajectory that precedes ${f.prevention.complicationToAvoid ?? 'clinical deterioration'}. If unchanged, further deterioration within ${horizon} is plausible.`
      }
      return `Possible emerging pattern. If additional signals join or the rate of change increases over the ${horizon}, concern rises substantially; if the signals settle, this may prove insignificant.`
    }
    case 'single_trend': {
      const def = s.signal
      if (f.trajectory === 'improving') {
        return s.abnormal
          ? `If the trend continues, ${def.label.toLowerCase()} is likely to return to range. No deterioration is signalled by this value.`
          : `Now within range. No deterioration is signalled by this value.`
      }
      if (f.trajectory === 'rapidly_worsening' || f.trajectory === 'progressively_worsening') {
        const rate = ratePerDay(s)
        const knowledge = knowledgeFor(def.id, s.abnormal ?? (def.worse === 'up' ? 'high' : 'low'))
        if (f.projection?.threshold !== null && f.projection?.threshold !== undefined && f.horizon) {
          return `At the current rate (${rate}), ${def.label.toLowerCase()} could reach ~${formatValue(def.id, f.projection.threshold)} ${def.unit} within ${HORIZON_LABEL[f.horizon]}, the range in which ${knowledge?.complication ?? 'complications'} become more likely.`
        }
        return `Continued ${directionWord(s)} is plausible if the underlying process persists (${rate}). No concern threshold is projected within 48 h at this rate.`
      }
      if (f.trajectory === 'watching') {
        return s.approachingAbnormal
          ? `At the current rate this would leave the reference range within 24 h. One interval is not yet a trajectory; the next measurement will clarify.`
          : `A single-interval change. Too early to call a trajectory; the next measurement will clarify.`
      }
      return 'No evidence from this trend alone of rapid deterioration. Continue watching the trajectory.'
    }
  }
}

function domainsOf(f: Finding): string {
  const names = [...new Set(f.series.map((s) => s.signal.domain))]
  const label: Record<string, string> = {
    electrolyte: 'electrolyte',
    renal: 'renal',
    respiratory: 'respiratory',
    hemodynamic: 'haemodynamic',
    hematologic: 'haematological',
    infection: 'inflammatory',
    metabolic: 'metabolic',
    endocrine: 'endocrine',
    multi_system: 'multi-system',
  }
  return names.map((n) => label[n] ?? n).join(', ')
}

/* ----------------------------------- Prevention ---------------------------------- */

function prevention(f: Finding): string {
  const meds = f.evidence.filter(isMedication)
  switch (f.kind) {
    case 'chronic_stable':
      return 'No action prompted by this value. It will be re-evaluated if it moves away from baseline.'
    case 'composite_recovery':
      return f.prevention.reviews.join('. ') + '.'
    case 'composite_deterioration':
    case 'single_trend': {
      if (f.severity === 'stable' || f.severity === 'informational') {
        if (f.trajectory === 'improving') return f.prevention.reviews.join('. ') + '.'
        return 'No urgent signal generated. Reassess if the change persists or associated clinical changes appear.'
      }
      const parts: string[] = []
      if (f.prevention.causes.length) parts.push(`Consider: ${f.prevention.causes.slice(0, 3).join('; ')}.`)
      if (meds.length) {
        parts.push(`Review ${meds.map((m) => m.medication.name).join(', ')} (${meds[0].relation}).`)
      }
      const checks = [...f.prevention.investigations.slice(0, 3), ...f.prevention.reviews.slice(0, 1)]
      if (checks.length) parts.push(`Check: ${checks.join('; ')}.`)
      if (f.missing.length) parts.push(`Not yet available: ${f.missing.map((m) => m.label).join(', ')}.`)
      return parts.join(' ')
    }
  }
}

/* -------------------------- Observed / inferred / uncertain -------------------------- */

function observed(f: Finding, patient: Patient): string[] {
  const out: string[] = []
  for (const e of f.evidence) {
    if (e.kind === 'series') {
      const s = f.series.find((x) => x.signal.id === e.signal)
      if (s) out.push(`${s.signal.label}: ${arrowSeries(s)} over ${formatHours(s.spanHours)}${e.role === 'supporting' ? ' (supporting)' : ''}`)
    } else if (e.kind === 'medication') {
      out.push(`${e.medication.name} ${e.medication.action.replace('_', ' ')} ${relativeTime(patient.admissionTime, e.medication.time)}${e.medication.detail ? ` — ${e.medication.detail}` : ''}`)
    } else {
      out.push(`${relativeTime(patient.admissionTime, e.event.time)} (${e.event.kind}): ${e.event.description}`)
    }
  }
  return out
}

function inferred(f: Finding): string[] {
  const out: string[] = []
  const s = f.series[0]
  out.push(`Trajectory classified as "${TRAJECTORY_LABEL[f.trajectory]}" from deterministic trend rules (not a statistical model).`)
  if (f.kind === 'composite_deterioration') {
    const core = f.evidence.filter(isSeries).filter((e) => e.role === 'core').length
    const sup = f.evidence.filter(isSeries).filter((e) => e.role === 'supporting').length
    out.push(`${core} core and ${sup} supporting signals move concordantly; the combination, not any single value, drives the severity.`)
  }
  for (const e of f.evidence.filter(isMedication)) {
    out.push(`${e.medication.name} is ${e.relation} — a temporal association, not a confirmed cause.`)
  }
  if (f.projection) {
    const def = SIGNALS[f.projection.signal]
    let text = `Linear extrapolation of the last interval: ~${formatValue(def.id, f.projection.value24h)} ${def.unit} in 24 h`
    if (f.projection.threshold !== null && f.projection.hoursToThreshold !== null) {
      text += `; ${formatValue(def.id, f.projection.threshold)} ${def.unit} reached in ~${formatHours(f.projection.hoursToThreshold)} if unchanged`
    }
    out.push(text + '. Extrapolation only; not a validated prediction.')
  }
  if (f.kind === 'chronic_stable') {
    out.push(`Difference from chronic baseline (${formatValue(s.signal.id, s.deltaBaseline)}) is within measurement noise.`)
  }
  return out
}

function uncertain(f: Finding): string[] {
  const out = f.missing.map((m) => `${m.label}: ${m.reason.toLowerCase()}.`)
  if (f.kind === 'composite_deterioration') {
    out.push('Which of the candidate causes is operating cannot be determined from the recorded data alone.')
  } else if (f.kind === 'single_trend' && f.prevention.causes.length > 1 && f.severity !== 'informational' && f.severity !== 'stable') {
    out.push('Several causes remain possible; the data do not identify one.')
  }
  if (f.severity === 'watch' && f.kind === 'single_trend') {
    out.push('Trend is short; it may be noise or the start of a pattern.')
  }
  return out
}

export function describeFinding(f: Finding, patient: Patient): FindingText {
  return {
    recognition: recognition(f),
    prediction: prediction(f),
    prevention: prevention(f),
    observed: observed(f, patient),
    inferred: inferred(f),
    uncertain: uncertain(f),
  }
}

export function wardHeadline(f: Finding | null, patient: Patient): string {
  if (!f) return 'No active patterns. All observed signals within range or at baseline.'
  return describeFinding(f, patient).recognition
}
