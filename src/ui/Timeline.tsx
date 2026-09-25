import { SIGNALS, formatWithUnit, relativeTime, type Patient, type SignalId } from '../engine'
import { clockTime } from './format'

interface Props {
  patient: Patient
  asOf: string
  /** Restrict to these signals; all signals when omitted. */
  signals?: SignalId[]
}

interface Row {
  time: string
  kind: 'observation' | 'medication' | 'event'
  text: string
}

/** Layer 3: the complete underlying record, chronologically, up to `asOf`. */
export function Timeline({ patient, asOf, signals }: Props) {
  const asOfMs = new Date(asOf).getTime()
  const want = signals ? new Set<SignalId>(signals) : null
  const rows: Row[] = []
  for (const o of patient.observations) {
    if (want && !want.has(o.signal)) continue
    if (new Date(o.time).getTime() > asOfMs) continue
    rows.push({ time: o.time, kind: 'observation', text: `${SIGNALS[o.signal].label} ${formatWithUnit(o.signal, o.value)}` })
  }
  for (const m of patient.medications) {
    if (new Date(m.time).getTime() > asOfMs) continue
    rows.push({ time: m.time, kind: 'medication', text: `${m.name} — ${m.action.replace('_', ' ')}${m.detail ? ` (${m.detail})` : ''}` })
  }
  for (const e of patient.events) {
    if (new Date(e.time).getTime() > asOfMs) continue
    rows.push({ time: e.time, kind: 'event', text: `${e.kind}: ${e.description}` })
  }
  rows.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const key = relativeTime(patient.admissionTime, r.time)
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }

  return (
    <div className="timeline">
      {[...groups.entries()].map(([label, items]) => (
        <div key={label} className="timeline-group">
          <div className="timeline-label">
            <span>{label}</span>
            <span className="muted">{clockTime(items[0].time)} UTC</span>
          </div>
          <ul>
            {items.map((r, i) => (
              <li key={i} className={`tl-${r.kind}`}>
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
