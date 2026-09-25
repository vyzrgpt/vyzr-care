# Vyzr Care — Clinical Intelligence Engine

Pure-TypeScript, deterministic pattern-recognition engine for hospitalised patients.
No runtime dependencies, no React, no I/O. Everything it produces is JSON.

```
OBSERVATIONS → normalize → trends → patterns (single + multi-signal) → scoring/suppression
            → explanations → PatientIntelligence
```

> **Demo status.** All thresholds, weights, reference ranges and pattern definitions are
> hackathon heuristics. Nothing here is clinically validated. Every patient in
> `demo-data/` is synthetic.

## Quick start

```ts
import { assessPatient, assessWard, PATIENTS, NOW } from '@/clinical-engine'

const pi = assessPatient(PATIENTS[1])                 // PatientIntelligence for "now" (latest observation)
const replay = assessPatient(PATIENTS[1], { asOf })   // same record, an earlier instant
const ward = assessWard(PATIENTS, { asOf: NOW })      // sorted by overallAttentionState (desc)
```

```
npm run typecheck          # strict tsc over the engine + scripts
npm test                   # vitest — 21 engine tests
npm run engine:fixture     # writes demo-data/ward-intelligence.json for the frontend
npx tsx scripts/generate-fixture.ts --print [ISO asOf]   # human-readable dump / time replay
```

## Files

| File | Responsibility |
|---|---|
| `types.ts` | Input model (`PatientRecord`, `ClinicalObservation`), internal analysis (`SeriesAnalysis`), output contract (`PatientIntelligence`, `RecognizedPattern`, …). Adapter-friendly: one flat timeline of typed observations. |
| `signals.ts` | Signal registry: reference range, noise band, "one meaningful step" scale, direction of concern, domain. |
| `config.ts` | Importance weights, severity thresholds, all tunable engine constants. |
| `normalize.ts` | Timeline → per-signal ordered series + medications + events, truncated at `asOf`. |
| `trends.ts` | Per-signal temporal analysis (below). |
| `pattern-library.ts` | Clinical knowledge: per-signal causes / investigations / horizons / medication relations, and `COMPOSITE_SPECS` for multi-signal patterns. |
| `patterns/trend.ts` | Single-signal rule: chronic-stable, improving, quiet, minor, worsening, progressive, rapid. |
| `patterns/composite.ts` | Multi-signal deterioration rule (driven by `COMPOSITE_SPECS`) and multi-signal recovery. |
| `patterns/context.ts` | Rule context (active meds, recent changes, recent events) + evidence builders. |
| `scoring.ts` | Transparent importance score → severity. |
| `explanations.ts` | Structured pattern → physician language (Recognition / Prediction / Prevention). Adds no facts, no probabilities, never changes severity. |
| `engine.ts` | Orchestration: subsumption, absorption, reassurance, overall state, `changedSinceLastReview`. |
| `demo-data/patients.ts` | Seven synthetic patients (A–G). |
| `tests/` | Scenario + invariant tests. |

## Input model

```ts
interface PatientRecord {
  patientId; name; age; sex; location; admissionTime; admittingDiagnosis; problems[]
  knownBaselines: Partial<Record<SignalId, number>>   // chronic baselines (e.g. CKD creatinine)
  timeline: ClinicalObservation[]                     // unordered; any category
}

type ClinicalObservation = NumericObservation | MedicationObservation | EventObservation
// NumericObservation: category lab|vital|oxygen|intake_output, code: SignalId, value, unit, referenceRange?
// MedicationObservation: name, classes[] (thiazide, nsaid, anticoagulant…), action started|stopped|dose_changed|continued
// EventObservation: category symptom|imaging|microbiology|nursing|procedure|note|clinical_event, description
```

Observation ids are carried through into evidence so every claim is traceable to a row in the
timeline. Values are analysed in the registry unit (`signals.ts`): known alternative units are
converted (`toRegistryUnit`, e.g. glucose mmol/L → mg/dL, creatinine µmol/L → mg/dL); anything
else is listed in `NormalizedPatient.skipped` with a reason rather than scored. A
`referenceRange` on the most recent observation overrides the registry range for that series.
Bidirectional signals with no bounds (urine osmolality, urine sodium) are carried as evidence
only and never form a trend pattern. A FHIR / EHR adapter would map `Observation` / `MedicationStatement` / `Procedure`
resources into this flat model; nothing downstream would change.

## Temporal analysis (`trends.ts`)

For each signal with ≥ 1 point up to `asOf`, `SeriesAnalysis` provides:

latest / previous · absolute + relative delta · delta from baseline (chronic if known, else
admission value) · velocity (per day, last interval) · acceleration · direction (noise-aware)
· persistence (consecutive same-direction intervals) · run change · reversal · worsening /
improving (direction-of-concern aware) · `approachingAbnormal` (in range but projected to cross
within `approachHours`) · `projected24h` · `chronicStable` · `everAbnormal`.

Noise bands per signal make 1.0 → 1.1 creatinine or 133 → 132 sodium "flat"; the `scale`
field defines one clinically meaningful step so that in-range drift stays quiet unless it is
large or heading for a limit.

## Pattern detection

**Single-signal (`patterns/trend.ts`)**, in priority order:

1. `chronic_stable_abnormality` — out of range but within tolerance of a known baseline → *suppressed*, surfaced as a reassuring signal.
2. `improving` — previously abnormal, moving toward range.
3. quiet — in range, no meaningful movement → no pattern (listed under `reassuringSignals` as `within_range`).
4. `minor_change` — abnormal but not moving, or small drift ("abnormal but not significantly changing", "minor change; no escalation signal").
5. `worsening` — sustained move in the direction of concern.
6. progressive / `rapidly_worsening` — persistence ≥ 2 or velocity ≥ `rapidRatePerDay × scale`.

**Multi-signal (`patterns/composite.ts`)**, one spec each in `COMPOSITE_SPECS`:

| id | core signals (min) | supporting | medication context |
|---|---|---|---|
| `multisystem_deterioration` | O₂, RR, SpO₂, SBP, HR, UO, Cr (3, ≥ 2 domains) | Temp, WBC, CRP, Lac | antihypertensive, NSAID… |
| `hemodynamic_deterioration` | SBP, HR, UO (2) | Cr, Lac, Temp | antihypertensive, diuretic |
| `renal_deterioration` | Cr, urea, UO (2) | K, HCO₃, SBP | NSAID, ACEi/ARB, contrast, diuretic |
| `respiratory_deterioration` | O₂, SpO₂, RR (2) | HR, Temp, WBC, CRP | sedative, opioid, IV fluid |
| `occult_bleeding` | Hb, HR, SBP (2, requires Hb) | UO, Lac, INR | anticoagulant, antiplatelet, NSAID |
| `inflammatory_escalation` | Temp, WBC, CRP (2) | HR, RR, Lac | steroid, immunosuppressant |

A composite fires when ≥ `minCore` core signals show meaningful worsening. Severity comes from
the shared importance score; strong/rapid concordance escalates to `concerning` / `urgent`.
`multi_signal_recovery` fires when ≥ 3 previously abnormal signals improve and none worsen.

**Orchestration (`engine.ts`)**: a composite is folded into a broader, at-least-as-severe
composite only when every one of its signals is covered, or when the broader spec declares it
may subsume it (`CompositeSpec.subsumes`) and covers ≥ 75 % of its signals — so bleeding folds in
haemodynamic deterioration, but haemodynamic or multisystem deterioration never hides bleeding,
whose haemoglobin signal they do not explain. Single-signal patterns explained by a composite
are *absorbed* (`absorbedPatternIds`).

**Freshness**: every analysis is anchored to `asOf`. `SeriesAnalysis.hoursSinceLatest` is the
age of the latest measurement; threshold projections subtract it (`hoursToThreshold` is time
from *now*, `thresholdStatus` is `ahead` / `crossed` / `overdue` when the extrapolated crossing
has passed unconfirmed), and measurements older than `staleAfterHours` (24 h) are called out in
`prediction.uncertainty`. A worsening trend also requires recent movement: a value that fell
early and then plateaued is displaced from baseline but no longer *worsening*.

## Importance → severity (`scoring.ts`, `config.ts`)

```
importance = magnitude + rate + persistence + acceleration + crossVariableAgreement + context + novelty
           − chronicBaseline − treatmentResponse − noise
```

Every component is reported in `RecognizedPattern.importance` so the UI can show *why*.
Thresholds: urgent ≥ 8, concerning ≥ 4.5, watch ≥ 2.5, minor ≥ 0.75, else stable.
`interruptiveAlertJustified` is true at `concerning` and above only.

## Output contract

```ts
interface PatientIntelligence {
  patientId; generatedAt; asOf
  overallTrajectory: 'improving' | 'stable' | 'worsening' | 'rapidly_worsening'
  overallAttentionState: 'stable' | 'minor' | 'watch' | 'concerning' | 'urgent'
  oneLineSummary: string
  changedSinceLastReview: ChangedSignal[]    // moved beyond noise since lastReviewAt (default asOf − 24 h)
  recognizedPatterns: RecognizedPattern[]    // sorted by severity, then importance
  reassuringSignals: ReassuringSignal[]      // within_range | chronic_baseline | improving | abnormal_but_stable
  suppressedPatterns: RecognizedPattern[]    // chronic-stable etc., with suppressedReason
  series: Partial<Record<SignalId, SeriesAnalysis>>   // full timeline layer for drill-down
}

interface RecognizedPattern {
  id; patternId; kind; clinicalDomain; title
  severity; trajectory; confidenceLevel: 'low' | 'moderate' | 'high'; timeHorizon: 'hours' | 'next_24h' | 'next_24_48h' | null
  recognition: { headline; explanation; detectedTrend; supportingObservations[] }
  prediction:  { trajectory; timeHorizon; plausibleNextConcern; statement; reasoning[]; uncertainty[]; projection }
  prevention:  { statement; causesToConsider[]; contextualFactors[]; investigationsToConsider[]; missingInformation[]; reassessmentPoints[]; complicationToAvoid }
  evidence: (SeriesEvidence | MedicationEvidence | EventEvidence)[]   // each with observationId(s)
  causesToConsider[]; investigationsToConsider[]; missingInformation[]
  interruptiveAlertJustified: boolean
  importance: ImportanceBreakdown; absorbedPatternIds[]; suppressedReason
}
```

Confidence is semantic and derived from the number of points / persistence / cross-signal
agreement. The engine never emits a percentage.

## Demo ward behaviour (`asOf = NOW`)

| Patient | Scenario | Result |
|---|---|---|
| A Priya Raman | Na 133 → 132 | **minor**, non-interruptive: "minor change; no escalation signal" |
| B Margaret Hale | Na 138 → 133 → 127 on new thiazide | **concerning**, rapidly worsening, horizon hours; osmolality/urine studies listed as missing |
| C Daniel Okafor | O₂ 2→3→5, RR 18→22→27, SBP 126→110→98, Cr 0.9→1.2→1.5, UO ↓ | **urgent** `multisystem_deterioration`; single-signal patterns absorbed |
| D Tomás Ferreira | pneumonia responding | **minor**, improving; `multi_signal_recovery`, no red alert |
| E Walter Brandt | CKD 4 at baseline | **stable**; 5 chronic abnormalities suppressed and listed as reassuring |
| F Aisha Rahman | Cr/urea ↑, UO ↓ post-contrast on NSAID + ARB | **concerning** `renal_deterioration` |
| G George Whitfield | Hb 12.6 → 9.1, HR ↑, SBP ↓ on apixaban | **concerning** `occult_bleeding` (haemodynamic composite folded in) |

## Frontend integration

- Import from `src/clinical-engine` (or load `demo-data/ward-intelligence.json`); render `PatientIntelligence` directly.
  Layer 1 = `oneLineSummary` + pattern `recognition.headline` / `prediction.statement` / `prevention.statement`.
  Layer 2 = `evidence[]`, `prediction.reasoning[]`, `prediction.uncertainty[]`, `importance`.
  Layer 3 = `series[signal].points`.
- Time replay: call `assessPatient(record, { asOf })` with any instant; it is pure and fast (< 1 ms per patient).
- `assessWard(records)` assesses every patient at one shared instant (default: the latest observation across the ward) so the ranking compares like with like; pass `asOf` to replay the whole ward.
- Observations whose `patientId` differs from the record's are skipped (`normalizePatient(...).skipped`, reason `patient_mismatch`), as are unknown signals, non-finite values and unsupported units.
- The UI must not re-derive severity, trajectory or confidence; those are the engine's.

## Limitations

- Heuristic thresholds and weights; not validated on any real cohort. Adjust in `config.ts` / `signals.ts`.
- Linear extrapolation only for projections; explicitly labelled as such in `prediction.reasoning`.
- Medication relations are class-level associations, not causal inference.
- Symptoms / imaging / microbiology are carried as context evidence, not yet parsed into signals.
- No FHIR or EHR adapter yet (input model is designed to accept one).
