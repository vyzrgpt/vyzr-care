import { useState } from 'react'
import { SIGNALS, formatWithUnit, relativeTime, type PatientAssessment } from '../engine'
import { FindingCard } from './FindingCard'
import { SeverityChip } from './SeverityChip'
import { Timeline } from './Timeline'
import { dateTime } from './format'

interface Props {
  assessment: PatientAssessment
}

export function PatientView({ assessment }: Props) {
  const { patient, findings, quiet, overallSeverity, asOf } = assessment
  const [showQuiet, setShowQuiet] = useState(false)
  const [showRecord, setShowRecord] = useState(false)

  const active = findings.filter((f) => !f.suppressedReason && f.severity !== 'stable' && f.severity !== 'informational')
  const informational = findings.filter((f) => !f.suppressedReason && (f.severity === 'informational' || f.severity === 'stable'))
  const suppressed = findings.filter((f) => f.suppressedReason)
  const activeMeds = patient.medications.filter(
    (m) => new Date(m.time).getTime() <= new Date(asOf).getTime() && m.action !== 'stopped',
  )

  return (
    <main className="patient">
      <header className="patient-head">
        <div>
          <div className="patient-title">
            <h2>{patient.name}</h2>
            <span className="muted">
              {patient.age}
              {patient.sex} · Bed {patient.bed} · {relativeTime(patient.admissionTime, asOf).split(' ')[0]} {relativeTime(patient.admissionTime, asOf).split(' ')[1]} of admission
            </span>
            <SeverityChip severity={overallSeverity} />
          </div>
          <p className="dx">
            <strong>{patient.admittingDiagnosis}</strong> · {patient.problems.join(' · ')}
          </p>
          <p className="muted small">Synthetic scenario: {patient.scenario}</p>
        </div>
      </header>

      <section className="findings">
        {active.length === 0 && (
          <div className="reassure">
            <h3>No pattern currently needs your attention.</h3>
            <p>
              {informational.length > 0
                ? `${informational.length} informational item${informational.length === 1 ? '' : 's'} below — abnormal or changing, but not concerning on current evidence.`
                : 'All observed signals are within range or behaving as expected for this patient.'}
              {suppressed.length > 0 && ` ${suppressed.length} chronic abnormalit${suppressed.length === 1 ? 'y is' : 'ies are'} at known baseline and deliberately not raised.`}
            </p>
          </div>
        )}
        {active.map((f, i) => (
          <FindingCard key={f.id} finding={f} patient={patient} asOf={asOf} defaultOpen={i === 0} />
        ))}
        {informational.map((f) => (
          <FindingCard key={f.id} finding={f} patient={patient} asOf={asOf} />
        ))}
      </section>

      <section className="quiet">
        <button type="button" className="linklike" onClick={() => setShowQuiet((v) => !v)} aria-expanded={showQuiet}>
          {showQuiet ? '▾' : '▸'} What the system is deliberately not raising ({suppressed.length + quiet.length})
        </button>
        {showQuiet && (
          <div className="quiet-body">
            {suppressed.map((f) => (
              <FindingCard key={f.id} finding={f} patient={patient} asOf={asOf} />
            ))}
            {quiet.length > 0 && (
              <div className="quiet-grid">
                {quiet.map((q) => (
                  <div key={q.signal} className="quiet-item">
                    <span>{SIGNALS[q.signal].label}</span>
                    <strong>{formatWithUnit(q.signal, q.latest)}</strong>
                    <span className="muted small">{q.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="context">
        <div>
          <h4>Current medications</h4>
          <ul>
            {activeMeds.map((m) => (
              <li key={`${m.name}-${m.time}`}>
                {m.name} <span className="muted">— {m.action.replace('_', ' ')} {relativeTime(patient.admissionTime, m.time)}{m.detail ? `, ${m.detail}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Events</h4>
          <ul>
            {patient.events
              .filter((e) => new Date(e.time).getTime() <= new Date(asOf).getTime())
              .map((e) => (
                <li key={`${e.kind}-${e.time}`}>
                  <span className="muted">{relativeTime(patient.admissionTime, e.time)} · {e.kind}</span> {e.description}
                </li>
              ))}
          </ul>
        </div>
      </section>

      <section className="record">
        <button type="button" className="linklike" onClick={() => setShowRecord((v) => !v)} aria-expanded={showRecord}>
          {showRecord ? '▾' : '▸'} Complete record to {dateTime(asOf)} UTC
        </button>
        {showRecord && <Timeline patient={patient} asOf={asOf} />}
      </section>
    </main>
  )
}
