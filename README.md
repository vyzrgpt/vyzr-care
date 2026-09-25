# Vyzr Care

**Recognition → Prediction → Prevention.**

A continuously operating clinical pattern-recognition and predictive intelligence system for hospitalized patients.
This repository contains the hackathon MVP: a physician-facing web app running a transparent, deterministic
clinical pattern engine over five entirely synthetic inpatients.

The MVP proves one thing: Vyzr Care can detect and communicate a clinically meaningful *evolving* pattern that a busy
physician could otherwise overlook — and it knows when to remain quiet.

> Clinical decision support only. Synthetic data only. Nothing here is a validated prediction model, and the system
> never diagnoses, never orders, and never shows manufactured probabilities.

## Running it

```bash
npm install          # .npmrc sets legacy-peer-deps
npm run dev          # http://localhost:5173
npm test             # scenario tests (vitest)
npm run lint && npm run typecheck && npm run build
```

Node 24 is used for development (`nvm use 24`).

## What the demo shows

Five synthetic patients, one ward list. Use the **assessment-time slider** in the top bar to replay the admission and
watch findings appear, escalate, or stay quiet as data arrives.

| Bed | Patient | Scenario | Expected behaviour |
| --- | --- | --- | --- |
| 12 | Margaret Hale | Sodium 138 → 134 → 130 → 127 after a new thiazide | **Concerning** — progressive hyponatraemia, thiazide/SSRI context, osmolality missing, 24 h horizon |
| 7 | Daniel Okafor | SBP, urine output, creatinine, HR, RR, O₂, temperature all drifting; none crosses a conventional threshold | **Concerning** — single high-concern *composite* pattern; the six single-signal alerts it explains are folded into it |
| 3 | Priya Raman | Sodium 135 → 133 → 132, everything else quiet | **Informational** — "mildly low, minor change"; no alert |
| 9 | Tomás Ferreira | Pneumonia responding to treatment | **Informational** — multi-signal recovery; no alert |
| 15 | Walter Brandt | CKD 4: creatinine 3.1, Hb 9.8, K 5.2, HCO₃ 20 at known baseline | **Stable** — every abnormality suppressed as chronic baseline |

Each finding is a three-layer card:

1. **Recognition / Prediction / Prevention** — one or two lines each.
2. **Evidence** — observed vs inferred vs uncertain/missing, sparklines of each contributing signal, and the full
   importance arithmetic ("Why is the system telling me this?").
3. **Full timeline** — the complete underlying record for that pattern's signals.

## Architecture

```
src/engine/            clinical pattern engine (pure TypeScript, no UI)
  types.ts             Observation, Patient, SeriesAnalysis, Finding, PatientAssessment …
  signals.ts           signal registry: reference range, worse-direction, noise, clinical scale
  analytics.ts         longitudinal analysis: delta, baseline, velocity, acceleration, persistence,
                       reversal, approaching-abnormal projection, chronic-baseline stability
  scoring.ts           transparent importance score → severity
  config.ts            weights, thresholds and tuning constants (all in one place)
  knowledge.ts         per-signal context: causes to consider, associated drug classes,
                       investigations, concern thresholds, complications to avoid
  rules/trend.ts       single-signal rule (progressive / watching / minor / improving / chronic-stable)
  rules/composite.ts   multi-signal rules: hypoperfusion, respiratory deterioration,
                       occult bleeding, inflammatory escalation, multi-signal recovery
  rules/context.ts     medication & event context, missing-information detection
  engine.ts            assessPatient / assessWard: runs rules, folds absorbed findings, orders the ward
  language.ts          language layer: structured Finding → physician text (never adds facts)
src/data/patients.ts   the five synthetic scenarios
src/ui/                React components (ward list, patient view, cards, replay, timeline)
```

**Engine vs language layer.** The engine produces structured `Finding` objects — severity, trajectory, horizon,
evidence, missing information, prevention content and the importance breakdown. `language.ts` only renders those
fields; it cannot invent a fact, add a probability, or change a severity. Deterministic pattern modules are designed to
be replaced or augmented by validated models later without touching the UI.

### Importance model (configurable, transparent)

```
importance = 1.0·magnitude + 1.0·rate + 0.5·persistence + 0.5·acceleration
           + 0.3·cross-variable agreement + 0.5·context + 0.5·novelty
           − 2.0·known chronic baseline − 1.5·expected treatment response − 1.0·isolated noise

urgent ≥ 8.0 · concerning ≥ 4.5 · watch ≥ 2.5 · informational ≥ 0.75 · otherwise stable
```

Every card exposes this arithmetic. The weights in `src/engine/config.ts` are illustrative and would require proper
clinical validation in a real product.

### Prediction language

Trajectories are one of: *stable, minor change, watching, progressively worsening, rapidly worsening, improving,
possible emerging pattern, high-concern pattern*. Time horizons (*hours / next 24 hours / next 24–48 hours*) are given
only when a sustained trend extrapolates linearly to a concern threshold, and are labelled as extrapolation.
