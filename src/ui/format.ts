import type { Severity } from '../engine'

export const SEVERITY_TONE: Record<Severity, string> = {
  stable: 'tone-stable',
  informational: 'tone-info',
  watch: 'tone-watch',
  concerning: 'tone-concerning',
  urgent: 'tone-urgent',
}

export function clockTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function dateTime(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  return `${day} ${clockTime(iso)}`
}
