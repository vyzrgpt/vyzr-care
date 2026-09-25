import { TRAJECTORY_LABEL, wardHeadline, type PatientAssessment } from '../engine'
import { SeverityChip } from './SeverityChip'

interface Props {
  assessments: PatientAssessment[]
  selectedId: string
  onSelect: (id: string) => void
}

/** One line per patient: who needs attention, and one sentence on why. */
export function WardList({ assessments, selectedId, onSelect }: Props) {
  const speaking = assessments.filter((a) => a.overallSeverity !== 'stable' && a.overallSeverity !== 'informational').length
  return (
    <nav className="ward" aria-label="Ward list">
      <div className="ward-summary">
        <strong>{assessments.length} patients</strong>
        <span className="muted">
          {speaking} need{speaking === 1 ? 's' : ''} attention · {assessments.length - speaking} quiet
        </span>
      </div>
      <ul>
        {assessments.map((a) => (
          <li key={a.patient.id}>
            <button
              type="button"
              className={`ward-row sev-${a.overallSeverity} ${a.patient.id === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(a.patient.id)}
              aria-current={a.patient.id === selectedId ? 'true' : undefined}
            >
              <div className="ward-row-top">
                <span className="bed">Bed {a.patient.bed}</span>
                <span className="name">{a.patient.name}</span>
                <span className="muted">
                  {a.patient.age}
                  {a.patient.sex}
                </span>
                <SeverityChip severity={a.overallSeverity} size="sm" />
              </div>
              <div className="ward-row-headline">
                {a.headline && <span className="trajectory">{TRAJECTORY_LABEL[a.headline.trajectory]} — </span>}
                {wardHeadline(a.headline, a.patient)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
