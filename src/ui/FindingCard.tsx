import { useState } from 'react'
import {
  HORIZON_LABEL,
  SIGNALS,
  TRAJECTORY_LABEL,
  describeFinding,
  formatWithUnit,
  relativeTime,
  type Finding,
  type Patient,
} from '../engine'
import { ImportanceTable } from './ImportanceTable'
import { SeverityChip } from './SeverityChip'
import { Sparkline } from './Sparkline'
import { Timeline } from './Timeline'

interface Props {
  finding: Finding
  patient: Patient
  asOf: string
  defaultOpen?: boolean
}

type Layer = 'summary' | 'evidence' | 'timeline'

/**
 * Three layers: (1) Recognition / Prediction / Prevention in one or two lines each,
 * (2) evidence — observed / inferred / uncertain, trends, and the importance arithmetic,
 * (3) the complete underlying timeline.
 */
export function FindingCard({ finding, patient, asOf, defaultOpen = false }: Props) {
  const [layer, setLayer] = useState<Layer>(defaultOpen ? 'evidence' : 'summary')
  const text = describeFinding(finding, patient)
  const isQuiet = finding.severity === 'stable' || finding.severity === 'informational'

  const toggle = (l: Layer) => setLayer((cur) => (cur === l ? 'summary' : l))

  return (
    <article className={`card ${isQuiet ? 'card-quiet' : ''} sev-${finding.severity}`}>
      <header className="card-head">
        <div className="card-title-row">
          <SeverityChip severity={finding.severity} />
          <h3>{finding.title}</h3>
        </div>
        <div className="card-meta">
          <span className="trajectory">{TRAJECTORY_LABEL[finding.trajectory]}</span>
          {finding.horizon && <span className="horizon">· {HORIZON_LABEL[finding.horizon]}</span>}
        </div>
      </header>

      <dl className="rpp">
        <div>
          <dt>Recognition</dt>
          <dd>{text.recognition}</dd>
        </div>
        <div>
          <dt>Prediction</dt>
          <dd>{text.prediction}</dd>
        </div>
        <div>
          <dt>Prevention</dt>
          <dd>{text.prevention}</dd>
        </div>
      </dl>

      {finding.suppressedReason && <p className="suppressed">Not raised as an alert: {finding.suppressedReason}</p>}

      <div className="card-actions">
        <button type="button" className={layer === 'evidence' ? 'active' : ''} onClick={() => toggle('evidence')} aria-expanded={layer === 'evidence'}>
          {layer === 'evidence' ? 'Hide evidence' : 'Why? Show evidence'}
        </button>
        <button type="button" className={layer === 'timeline' ? 'active' : ''} onClick={() => toggle('timeline')} aria-expanded={layer === 'timeline'}>
          {layer === 'timeline' ? 'Hide timeline' : 'Full timeline'}
        </button>
      </div>

      {layer === 'evidence' && (
        <section className="evidence">
          <div className="evidence-cols">
            <div>
              <h4>Observed</h4>
              <ul>
                {text.observed.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Inferred</h4>
              <ul>
                {text.inferred.length === 0 && <li className="muted">No inference beyond the observations.</li>}
                {text.inferred.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Uncertain / missing</h4>
              <ul>
                {text.uncertain.length === 0 && <li className="muted">Nothing outstanding for this pattern.</li>}
                {text.uncertain.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="trends">
            {finding.series.map((s) => (
              <figure key={s.signal.id}>
                <Sparkline signal={s.signal.id} points={patient.observations.filter((o) => o.signal === s.signal.id)} asOf={asOf} />
                <figcaption>
                  <strong>{s.signal.label}</strong>
                  <span>
                    {s.points.map((p) => SIGNALS[s.signal.id].decimals === 0 ? Math.round(p.value) : p.value.toFixed(SIGNALS[s.signal.id].decimals)).join(' → ')} {s.signal.unit}
                  </span>
                  <span className="muted">
                    latest {formatWithUnit(s.signal.id, s.latest)} · {relativeTime(patient.admissionTime, s.latestTime)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>

          {finding.prevention.complicationToAvoid && !isQuiet && (
            <p className="avoid">
              <strong>Trajectory intended to avoid:</strong> {finding.prevention.complicationToAvoid}
            </p>
          )}

          <details className="why">
            <summary>Why is the system telling me this? Importance arithmetic</summary>
            <ImportanceTable importance={finding.importance} />
          </details>
        </section>
      )}

      {layer === 'timeline' && (
        <section className="evidence">
          <Timeline patient={patient} asOf={asOf} signals={finding.signals} />
        </section>
      )}
    </article>
  )
}
