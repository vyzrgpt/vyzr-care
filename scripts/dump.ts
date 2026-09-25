import { NOW, PATIENTS } from '../src/data/patients'
import { assessWard, describeFinding, SEVERITY_LABEL, TRAJECTORY_LABEL } from '../src/engine'

const asOf = process.argv[2] ?? NOW
for (const a of assessWard(PATIENTS, asOf)) {
  console.log(`\n=== ${a.patient.name} (${a.patient.id}) — ${SEVERITY_LABEL[a.overallSeverity]} ===`)
  for (const f of a.findings) {
    const t = describeFinding(f, a.patient)
    console.log(`\n[${SEVERITY_LABEL[f.severity]} | ${TRAJECTORY_LABEL[f.trajectory]}${f.horizon ? ` | ${f.horizon}` : ''}] ${f.title}  (score ${f.importance.total})`)
    if (f.suppressedReason) console.log(`  SUPPRESSED: ${f.suppressedReason}`)
    console.log(`  R: ${t.recognition}`)
    console.log(`  P: ${t.prediction}`)
    console.log(`  V: ${t.prevention}`)
    console.log(`  components: ${JSON.stringify(f.importance.components)}`)
    if (t.uncertain.length) console.log(`  uncertain: ${t.uncertain.join(' | ')}`)
  }
  console.log(`  quiet: ${a.quiet.map((q) => `${q.signal}=${q.latest}`).join(', ')}`)
}
