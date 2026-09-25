/**
 * Runs the engine over the synthetic ward and writes a JSON fixture for the frontend.
 *
 *   npm run engine:fixture                # writes src/clinical-engine/demo-data/ward-intelligence.json
 *   npx tsx scripts/generate-fixture.ts --print [ISO asOf]   # prints a readable summary instead
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOW, PATIENTS, SEVERITY_LABEL, TRAJECTORY_LABEL, assessWard } from '../src/clinical-engine'

const args = process.argv.slice(2)
const print = args.includes('--print')
const asOf = args.find((a) => /^\d{4}-\d{2}-\d{2}T/.test(a)) ?? NOW

const ward = assessWard(PATIENTS, { asOf })

if (print) {
  for (const pi of ward) {
    const rec = PATIENTS.find((p) => p.patientId === pi.patientId)
    console.log(`\n=== ${rec?.name} (${pi.patientId}) — ${SEVERITY_LABEL[pi.overallAttentionState].toUpperCase()} · ${pi.overallTrajectory}`)
    console.log(`  ${pi.oneLineSummary}`)
    if (pi.changedSinceLastReview.length) {
      console.log(`  changed since review: ${pi.changedSinceLastReview.map((c) => `${c.label} ${c.previous}→${c.latest}${c.partOfPattern ? '*' : ''}`).join(', ')}`)
    }
    for (const p of pi.recognizedPatterns) {
      console.log(`  • [${SEVERITY_LABEL[p.severity]} · ${TRAJECTORY_LABEL[p.trajectory]} · conf ${p.confidenceLevel} · ${p.timeHorizon ?? '—'} · interrupt=${p.interruptiveAlertJustified}] ${p.title}  (score ${p.importance.total})`)
      console.log(`      R: ${p.recognition.headline}`)
      console.log(`      P: ${p.prediction.statement}`)
      console.log(`      V: ${p.prevention.statement}`)
    }
    for (const p of pi.suppressedPatterns) console.log(`  ○ suppressed: ${p.title} — ${p.suppressedReason}`)
    console.log(`  reassuring: ${pi.reassuringSignals.map((r) => `${r.label} (${r.status})`).join(', ')}`)
  }
} else {
  const here = dirname(fileURLToPath(import.meta.url))
  const out = resolve(here, '../src/clinical-engine/demo-data/ward-intelligence.json')
  mkdirSync(dirname(out), { recursive: true })
  const stripped = ward.map(({ series: _series, ...rest }) => rest)
  writeFileSync(out, JSON.stringify({ asOf, patients: stripped }, null, 2) + '\n')
  console.log(`wrote ${out} (${stripped.length} patients)`)
}
