import { dateTime } from './format'

interface Props {
  start: string
  end: string
  value: string
  onChange: (iso: string) => void
}

const STEP_MS = 3_600_000

/** Scrub the assessment time to see how the ward looked as data arrived. */
export function ReplayControl({ start, end, value, onChange }: Props) {
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  const steps = Math.round((endMs - startMs) / STEP_MS)
  const current = Math.round((new Date(value).getTime() - startMs) / STEP_MS)
  const atEnd = current >= steps
  const hoursBack = steps - current

  return (
    <div className="replay">
      <label htmlFor="replay-slider">
        <span>Assessment time</span>
        <strong>{dateTime(value)} UTC</strong>
        <span className="muted">{atEnd ? 'now' : `${hoursBack} h earlier`}</span>
      </label>
      <input
        id="replay-slider"
        type="range"
        min={0}
        max={steps}
        step={1}
        value={current}
        onChange={(e) => onChange(new Date(startMs + Number(e.target.value) * STEP_MS).toISOString())}
      />
      <div className="replay-buttons">
        <button type="button" onClick={() => onChange(new Date(Math.max(startMs, new Date(value).getTime() - 24 * STEP_MS)).toISOString())} disabled={current === 0}>
          −24 h
        </button>
        <button type="button" onClick={() => onChange(new Date(Math.min(endMs, new Date(value).getTime() + 24 * STEP_MS)).toISOString())} disabled={atEnd}>
          +24 h
        </button>
        <button type="button" onClick={() => onChange(end)} disabled={atEnd}>
          Now
        </button>
      </div>
    </div>
  )
}
