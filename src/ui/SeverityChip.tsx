import { SEVERITY_LABEL, type Severity } from '../engine'
import { SEVERITY_TONE } from './format'

export function SeverityChip({ severity, size = 'md' }: { severity: Severity; size?: 'sm' | 'md' }) {
  return <span className={`chip ${SEVERITY_TONE[severity]} chip-${size}`}>{SEVERITY_LABEL[severity]}</span>
}
