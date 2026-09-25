import { useMemo, useState } from 'react'
import { NOW, PATIENTS } from './data/patients'
import { assessWard } from './engine'
import { PatientView } from './ui/PatientView'
import { ReplayControl } from './ui/ReplayControl'
import { WardList } from './ui/WardList'

const EARLIEST = PATIENTS.reduce(
  (min, p) => (new Date(p.admissionTime).getTime() < new Date(min).getTime() ? p.admissionTime : min),
  PATIENTS[0].admissionTime,
)

export default function App() {
  const [asOf, setAsOf] = useState(NOW)
  const assessments = useMemo(() => assessWard(PATIENTS, asOf), [asOf])
  const [selectedId, setSelectedId] = useState(assessments[0].patient.id)
  const selected = assessments.find((a) => a.patient.id === selectedId) ?? assessments[0]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">Vyzr Care</span>
          <span className="tagline">Recognition → Prediction → Prevention</span>
        </div>
        <ReplayControl start={EARLIEST} end={NOW} value={asOf} onChange={setAsOf} />
        <span className="synthetic">Synthetic patients · deterministic pattern rules · decision support, not diagnosis</span>
      </header>
      <div className="body">
        <WardList assessments={assessments} selectedId={selected.patient.id} onSelect={setSelectedId} />
        <PatientView key={`${selected.patient.id}-${asOf}`} assessment={selected} />
      </div>
    </div>
  )
}
