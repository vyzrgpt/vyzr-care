/**
 * Explanation layer: converts a `RawPattern` (structured engine output) into the
 * physician-facing `RecognizedPattern` contract. It never adds clinical facts, never
 * produces probabilities and never changes severity — every sentence is derived from
 * fields the rules populated. A language model could later replace this module but
 * would be bound by the same constraints.
 */
import { ANALYSIS_CONFIG } from './config'
import { knowledgeFor } from './pattern-library'
import type { RawPattern } from './patterns/context'
import { SIGNALS, formatValue } from './signals'
import { hoursBetween } from './trends'
import { SEVERITY_ORDER } from './types'
import type {
  ClinicalDomain,
  Evidence,
  MedicationEvidence,
  PatientRecord,
  Prediction,
  Prevention,
  Recognition,
  RecognizedPattern,
  SeriesAnalysis,
  SeriesEvidence,
  Severity,
  TimeHorizon,
  Trajectory,
} from './types'

export const SEVERITY_LABEL: Record<Severity, string> = {
  stable: 'Stable',
  minor: 'Minor',
  watch: 'Watch',
  concerning: 'Concerning',
  urgent: 'Urgent',
}

export const TRAJECTORY_LABEL: Record<Trajectory, string> = {
  improving: 'Improving',
  stable: 'Stable',
  minor_change: 'Minor change',
  worsening: 'Worsening',
  rapidly_worsening: 'Rapidly worsening',
}

export const HORIZON_LABEL: Record<TimeHorizon, string> = {
  hours: 'hours',
  next_24h: 'next 24 hours',
  next_24_48h: 'next 24–48 hours',
}

const DOMAIN_LABEL: Record<ClinicalDomain, string> = {
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

/** Lower-cases a signal label for mid-sentence use unless it starts with an acronym (INR, TSH, C-reactive…). */
function lower(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label
}

function signed(value: number, decimals: number): string {
  const s = value.toFixed(decimals)
  return value > 0 ? `+${s}` : s
}

function endpoints(s: SeriesAnalysis): string {
  const def = s.signal
  return `${def.shortLabel} ${formatValue(def.id, s.points[0].value)} → ${formatValue(def.id, s.latest)}${def.unit ? ` ${def.unit}` : ''}`
}

function directionWord(s: SeriesAnalysis): string {
  return s.deltaBaseline > 0 ? 'rise' : 'decline'
}

function ratePerDay(s: SeriesAnalysis): string | null {
  if (s.velocityPerDay === null) return null
  const def = s.signal
  return `≈${Math.abs(s.velocityPerDay).toFixed(def.decimals)} ${def.unit}/day`
}

function isSeries(e: Evidence): e is SeriesEvidence {
  return e.kind === 'series'
}
function isMedication(e: Evidence): e is MedicationEvidence {
  return e.kind === 'medication'
}
function seriesSpan(series: SeriesAnalysis[]): number {
  return Math.max(...series.map((s) => s.spanHours))
}
function isQuiet(p: RawPattern): boolean {
  return p.severity === 'stable' || p.severity === 'minor'
}
function isProgressive(p: RawPattern): boolean {
  return p.trajectory === 'rapidly_worsening' || (p.trajectory === 'worsening' && p.series[0].persistence >= 2)
}
function domainsOf(p: RawPattern): string {
  return [...new Set(p.series.map((s) => s.signal.domain))].map((d) => DOMAIN_LABEL[d]).join(', ')
}

/* ---------------------------------- Recognition ---------------------------------- */

function recognitionHeadline(p: RawPattern): string {
  const s = p.series[0]
  const arrow = p.evidence.find(isSeries)?.summary ?? ''
  switch (p.kind) {
    case 'chronic_stable_abnormality': {
      const def = s.signal
      return `${def.label} ${formatValue(def.id, s.latest)} ${def.unit}: outside the reference range but unchanged from the known baseline of ${formatValue(def.id, s.baseline)} across ${formatHours(s.spanHours)} of observation.`
    }
    case 'multi_signal_recovery':
      return `${p.series.length} previously abnormal signals are improving together over ${formatHours(seriesSpan(p.series))}: ${p.series.map(endpoints).join(', ')}.`
    case 'multi_signal_deterioration': {
      const core = p.evidence.filter(isSeries).filter((e) => e.role === 'core')
      const supporting = p.evidence.filter(isSeries).filter((e) => e.role === 'supporting')
      const coreText = core
        .map((e) => p.series.find((x) => x.signal.id === e.signal))
        .filter((x): x is SeriesAnalysis => !!x)
        .map(endpoints)
        .join(', ')
      const supText = supporting.map((e) => `${SIGNALS[e.signal].shortLabel} ${e.direction === 'up' ? '↑' : '↓'}`).join(', ')
      const allMild = p.series.every((x) => x.magnitude < 0.5)
      return (
        `${p.series.length} signals moving in the same direction over ${formatHours(seriesSpan(p.series))}: ${coreText}` +
        (supText ? `; also ${supText}.` : '.') +
        (allMild ? ' No single value has crossed a conventional alarm threshold.' : '')
      )
    }
    case 'single_signal_trend': {
      const def = s.signal
      if (p.trajectory === 'improving') {
        return `${def.label} improving over ${formatHours(s.spanHours)}: ${arrow}${s.abnormal === null ? ', now within range' : ''}.`
      }
      const fromAdmission = `${signed(s.deltaBaseline, def.decimals)} from ${s.baselineSource === 'chronic' ? 'baseline' : 'admission'}`
      const last = s.deltaPrevious !== null ? `; ${signed(s.deltaPrevious, def.decimals)} since the previous measurement` : ''
      if (isProgressive(p)) {
        const adj = p.trajectory === 'rapidly_worsening' ? 'Rapid, sustained' : 'Progressive'
        return `${adj} ${lower(def.label)} ${directionWord(s)} over ${formatHours(s.spanHours)}: ${arrow} (${fromAdmission}${last}).`
      }
      if (p.trajectory === 'worsening') {
        const approach = s.approachingAbnormal ? ' Still within range, but moving toward the limit.' : ''
        return `${def.label} ${s.direction === 'up' ? 'rising' : 'falling'}: ${arrow} (${fromAdmission}${last}).${approach}`
      }
      const mild = s.abnormal ? `Mildly ${s.abnormal} ${lower(def.label)}` : def.label
      const trendWord = s.direction === 'flat' ? 'essentially unchanged' : `small ${s.direction === 'up' ? 'upward' : 'downward'} drift`
      return `${mild}, ${trendWord}: ${arrow} over ${formatHours(s.spanHours)} (${fromAdmission}${last}). Change since the previous measurement is small.`
    }
  }
}

function supportingObservations(p: RawPattern, record: PatientRecord): string[] {
  const out: string[] = []
  for (const e of p.evidence) {
    if (e.kind === 'series') {
      const s = p.series.find((x) => x.signal.id === e.signal)
      if (s) out.push(`${s.signal.label}: ${e.summary} over ${formatHours(s.spanHours)}${e.role === 'supporting' ? ' (supporting)' : ''}`)
    } else if (e.kind === 'medication') {
      out.push(`${e.name} ${e.action.replace('_', ' ')} ${relativeTime(record.admissionTime, e.time)}${e.detail ? ` — ${e.detail}` : ''}`)
    } else {
      out.push(`${relativeTime(record.admissionTime, e.time)} (${e.category.replace('_', ' ')}): ${e.description}`)
    }
  }
  return out
}

function recognition(p: RawPattern, record: PatientRecord): Recognition {
  return {
    headline: recognitionHeadline(p),
    explanation: `Detected: ${p.detectedTrend}. Classified by deterministic trend rules, not a statistical model.`,
    detectedTrend: p.detectedTrend,
    supportingObservations: supportingObservations(p, record),
  }
}

/* ----------------------------------- Prediction ---------------------------------- */

function predictionStatement(p: RawPattern): { statement: string; nextConcern: string | null } {
  const s = p.series[0]
  switch (p.kind) {
    case 'chronic_stable_abnormality':
      return { statement: 'No new trajectory. This value is behaving as expected for this patient; no deterioration is signalled by it.', nextConcern: null }
    case 'multi_signal_recovery':
      return { statement: 'Trajectory consistent with response to treatment. Continued improvement is plausible if no new insult occurs.', nextConcern: null }
    case 'multi_signal_deterioration': {
      const horizon = p.horizon ? HORIZON_LABEL[p.horizon] : 'coming day'
      const complication = p.prevention.complicationToAvoid ?? 'clinical deterioration'
      if (p.severity === 'concerning' || p.severity === 'urgent') {
        return {
          statement: `Concordant movement across ${domainsOf(p)} is the kind of trajectory that precedes ${complication}. If unchanged, further deterioration within ${horizon} is plausible.`,
          nextConcern: complication,
        }
      }
      return {
        statement: `Possible emerging pattern. If additional signals join or the rate of change increases over the ${horizon}, concern rises substantially; if the signals settle, this may prove insignificant.`,
        nextConcern: complication,
      }
    }
    case 'single_signal_trend': {
      const def = s.signal
      if (p.trajectory === 'improving') {
        return {
          statement: s.abnormal
            ? `If the trend continues, ${lower(def.label)} is likely to return to range. No deterioration is signalled by this value.`
            : 'Now within range. No deterioration is signalled by this value.',
          nextConcern: null,
        }
      }
      if (isProgressive(p)) {
        const rate = ratePerDay(s)
        const knowledge = knowledgeFor(def.id, s.abnormal ?? (def.worse === 'up' ? 'high' : 'low'))
        const complication = knowledge?.complication ?? 'complications'
        const threshold = p.projection?.threshold ?? null
        if (threshold !== null && p.projection?.thresholdStatus === 'crossed') {
          return {
            statement: `${def.label} is already beyond ~${formatValue(def.id, threshold)} ${def.unit}, the range in which ${complication} become more likely, and is still ${s.deltaBaseline > 0 ? 'rising' : 'falling'} (${rate}). Further ${directionWord(s)} is plausible if the underlying process persists.`,
            nextConcern: complication,
          }
        }
        if (threshold !== null && p.projection?.thresholdStatus === 'overdue') {
          return {
            statement: `At the rate last measured ${formatHours(p.projection.measuredHoursAgo)} ago (${rate}), ${lower(def.label)} would have reached ~${formatValue(def.id, threshold)} ${def.unit}, the range in which ${complication} become more likely, by now. No measurement since; the current value is unknown until repeated.`,
            nextConcern: complication,
          }
        }
        if (threshold !== null && p.horizon) {
          return {
            statement: `At the current rate (${rate}), ${lower(def.label)} could reach ~${formatValue(def.id, threshold)} ${def.unit} within ${HORIZON_LABEL[p.horizon]}, the range in which ${complication} become more likely.`,
            nextConcern: complication,
          }
        }
        return {
          statement: `Continued ${directionWord(s)} is plausible if the underlying process persists (${rate}). No concern threshold is projected within 48 h at this rate.`,
          nextConcern: complication,
        }
      }
      if (p.trajectory === 'worsening') {
        return {
          statement: s.approachingAbnormal
            ? 'At the current rate this would leave the reference range within 24 h. One interval is not yet a trajectory; the next measurement will clarify.'
            : 'A single-interval change. Too early to call a trajectory; the next measurement will clarify.',
          nextConcern: null,
        }
      }
      return { statement: 'No evidence from this trend alone of rapid deterioration. Continue watching the trajectory.', nextConcern: null }
    }
  }
}

function predictionReasoning(p: RawPattern): string[] {
  const out: string[] = [`Trajectory classified as "${TRAJECTORY_LABEL[p.trajectory]}" from deterministic trend rules (not a statistical model).`]
  if (p.kind === 'multi_signal_deterioration') {
    const core = p.evidence.filter(isSeries).filter((e) => e.role === 'core').length
    const sup = p.evidence.filter(isSeries).filter((e) => e.role === 'supporting').length
    out.push(`${core} core and ${sup} supporting signals move concordantly; the combination, not any single value, drives the severity.`)
  }
  for (const e of p.evidence.filter(isMedication)) {
    out.push(`${e.name} (${e.action}): ${e.relation} — a temporal association, not a confirmed cause.`)
  }
  if (p.projection) {
    const def = SIGNALS[p.projection.signal]
    const age = p.projection.measuredHoursAgo
    let text = `Linear extrapolation of the last interval (latest measurement ${age > 0 ? `${formatHours(age)} ago` : 'at assessment time'}): ~${formatValue(def.id, p.projection.value24h)} ${def.unit} 24 h after that measurement`
    if (p.projection.threshold !== null && p.projection.hoursToThreshold !== null && p.projection.thresholdStatus === 'ahead') {
      text += `; ${formatValue(def.id, p.projection.threshold)} ${def.unit} reached in ~${formatHours(p.projection.hoursToThreshold)} from now if unchanged`
    }
    out.push(text + '. Extrapolation only; not a validated prediction.')
  }
  if (p.kind === 'chronic_stable_abnormality') {
    const s = p.series[0]
    out.push(`Difference from chronic baseline (${formatValue(s.signal.id, s.deltaBaseline)}) is within measurement noise.`)
  }
  return out
}

function predictionUncertainty(p: RawPattern): string[] {
  const out = p.missing.map((m) => `${m.label}: ${m.reason.toLowerCase()}.`)
  if (p.kind === 'multi_signal_deterioration') {
    out.push('Which of the candidate causes is operating cannot be determined from the recorded data alone.')
  } else if (p.kind === 'single_signal_trend' && p.prevention.causes.length > 1 && !isQuiet(p)) {
    out.push('Several causes remain possible; the data do not identify one.')
  }
  if (p.severity === 'watch' && p.kind === 'single_signal_trend') {
    out.push('Trend is short; it may be noise or the start of a pattern.')
  }
  if (!isQuiet(p)) {
    const stale = p.series.filter((s) => s.hoursSinceLatest > ANALYSIS_CONFIG.staleAfterHours)
    for (const s of stale) {
      out.push(`Latest ${lower(s.signal.label)} is ${formatHours(s.hoursSinceLatest)} old at the assessment time; the current trajectory is unconfirmed until it is repeated.`)
    }
  }
  return out
}

function prediction(p: RawPattern): Prediction {
  const { statement, nextConcern } = predictionStatement(p)
  return {
    trajectory: p.trajectory,
    timeHorizon: p.horizon,
    plausibleNextConcern: nextConcern,
    statement,
    reasoning: predictionReasoning(p),
    uncertainty: predictionUncertainty(p),
    projection: p.projection,
  }
}

/* ----------------------------------- Prevention ---------------------------------- */

function preventionStatement(p: RawPattern): string {
  const meds = p.evidence.filter(isMedication)
  switch (p.kind) {
    case 'chronic_stable_abnormality':
      return 'No action prompted by this value. It will be re-evaluated if it moves away from baseline.'
    case 'multi_signal_recovery':
      return p.prevention.reviews.join('. ') + '.'
    case 'multi_signal_deterioration':
    case 'single_signal_trend': {
      if (isQuiet(p)) {
        if (p.trajectory === 'improving') return p.prevention.reviews.join('. ') + '.'
        return 'No urgent signal generated. Reassess if the change persists or associated clinical changes appear.'
      }
      const parts: string[] = []
      if (p.prevention.causes.length) parts.push(`Consider: ${p.prevention.causes.slice(0, 3).join('; ')}.`)
      if (meds.length) parts.push(`Review ${meds.map((m) => m.name).join(', ')} (${meds[0].relation}).`)
      const checks = [...p.prevention.investigations.slice(0, 3), ...p.prevention.reviews.slice(0, 1)]
      if (checks.length) parts.push(`Check: ${checks.join('; ')}.`)
      if (p.missing.length) parts.push(`Not yet available: ${p.missing.map((m) => m.label).join(', ')}.`)
      return parts.join(' ')
    }
  }
}

function prevention(p: RawPattern): Prevention {
  const meds = p.evidence.filter(isMedication)
  const quiet = isQuiet(p)
  return {
    statement: preventionStatement(p),
    causesToConsider: quiet ? [] : p.prevention.causes,
    contextualFactors: meds.map((m) => `${m.name} (${m.action.replace('_', ' ')}): ${m.relation}`),
    investigationsToConsider: quiet ? [] : p.prevention.investigations,
    missingInformation: p.missing,
    reassessmentPoints: p.prevention.reviews,
    complicationToAvoid: quiet ? null : p.prevention.complicationToAvoid,
  }
}

/* ----------------------------------- Assembly ------------------------------------ */

export function interruptiveAlertJustified(severity: Severity): boolean {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(ANALYSIS_CONFIG.interruptiveSeverity)
}

export function explainPattern(p: RawPattern, record: PatientRecord, absorbedPatternIds: string[] = []): RecognizedPattern {
  const prev = prevention(p)
  return {
    id: p.id,
    patternId: p.patternId,
    kind: p.kind,
    clinicalDomain: p.domain,
    title: p.title,
    severity: p.severity,
    trajectory: p.trajectory,
    confidenceLevel: p.confidence,
    recognition: recognition(p, record),
    prediction: prediction(p),
    prevention: prev,
    evidence: p.evidence,
    causesToConsider: prev.causesToConsider,
    investigationsToConsider: prev.investigationsToConsider,
    missingInformation: p.missing,
    timeHorizon: p.horizon,
    interruptiveAlertJustified: interruptiveAlertJustified(p.severity),
    signals: p.signals,
    importance: p.importance,
    suppressedReason: p.suppressedReason,
    absorbedPatternIds,
  }
}
