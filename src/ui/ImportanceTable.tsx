import { IMPORTANCE_WEIGHTS, SEVERITY_THRESHOLDS, type ImportanceBreakdown, type ImportanceComponents } from '../engine'

const LABELS: Record<keyof ImportanceComponents, string> = {
  magnitude: 'Magnitude outside range',
  rateOfChange: 'Rate of change',
  persistence: 'Persistence',
  acceleration: 'Acceleration',
  crossVariableAgreement: 'Cross-variable agreement',
  context: 'Medication / clinical context',
  novelty: 'Novelty',
  chronicBaseline: 'Known chronic baseline',
  treatmentResponse: 'Expected treatment response',
  noise: 'Isolated noise',
}

const KEYS = Object.keys(LABELS) as (keyof ImportanceComponents)[]

/** "Why is the system telling me this?" — the transparent importance arithmetic. */
export function ImportanceTable({ importance }: { importance: ImportanceBreakdown }) {
  const rows = KEYS.filter((k) => importance.components[k] !== 0)
  return (
    <div className="importance">
      <table>
        <thead>
          <tr>
            <th>Factor</th>
            <th>Value</th>
            <th>Weight</th>
            <th>Contribution</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k} className={IMPORTANCE_WEIGHTS[k] < 0 ? 'neg' : ''}>
              <td>{LABELS[k]}</td>
              <td>{importance.components[k].toFixed(2)}</td>
              <td>{IMPORTANCE_WEIGHTS[k] > 0 ? '+' : ''}{IMPORTANCE_WEIGHTS[k].toFixed(1)}</td>
              <td>{importance.contributions[k] > 0 ? '+' : ''}{importance.contributions[k].toFixed(2)}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={3}>Importance score</td>
            <td>{importance.total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        Thresholds: {SEVERITY_THRESHOLDS.filter((t) => Number.isFinite(t.min)).map((t) => `${t.severity} ≥ ${t.min}`).join(' · ')}. Deterministic
        configurable rules for the MVP — not a validated prediction model.
      </p>
    </div>
  )
}
