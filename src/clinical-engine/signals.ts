import type { SignalDefinition, SignalId } from './types'

/** Signal registry. Reference ranges/noise/scale are DEMO / NOT CLINICALLY VALIDATED. */
const defs: SignalDefinition[] = [
  { id: 'sodium', category: 'lab', label: 'Sodium', shortLabel: 'Na', unit: 'mmol/L', domain: 'electrolyte', low: 135, high: 145, worse: 'both', noise: 1, scale: 5, decimals: 0 },
  { id: 'potassium', category: 'lab', label: 'Potassium', shortLabel: 'K', unit: 'mmol/L', domain: 'electrolyte', low: 3.5, high: 5.0, worse: 'both', noise: 0.2, scale: 0.5, decimals: 1 },
  { id: 'creatinine', category: 'lab', label: 'Creatinine', shortLabel: 'Cr', unit: 'mg/dL', domain: 'renal', low: 0.6, high: 1.2, worse: 'up', noise: 0.1, scale: 0.3, decimals: 2 },
  { id: 'urea', category: 'lab', label: 'Urea', shortLabel: 'Urea', unit: 'mmol/L', domain: 'renal', low: 2.5, high: 7.8, worse: 'up', noise: 0.5, scale: 3, decimals: 1 },
  { id: 'bicarbonate', category: 'lab', label: 'Bicarbonate', shortLabel: 'HCO3', unit: 'mmol/L', domain: 'metabolic', low: 22, high: 29, worse: 'down', noise: 1, scale: 3, decimals: 0 },
  { id: 'glucose', category: 'lab', label: 'Glucose', shortLabel: 'Glu', unit: 'mg/dL', domain: 'metabolic', low: 70, high: 140, worse: 'both', noise: 10, scale: 40, decimals: 0 },
  { id: 'hemoglobin', category: 'lab', label: 'Haemoglobin', shortLabel: 'Hb', unit: 'g/dL', domain: 'hematologic', low: 12, high: 16, worse: 'down', noise: 0.4, scale: 1, decimals: 1 },
  { id: 'platelets', category: 'lab', label: 'Platelets', shortLabel: 'Plt', unit: '×10⁹/L', domain: 'hematologic', low: 150, high: 400, worse: 'down', noise: 15, scale: 50, decimals: 0 },
  { id: 'wbc', category: 'lab', label: 'White cell count', shortLabel: 'WBC', unit: '×10⁹/L', domain: 'infection', low: 4, high: 11, worse: 'up', noise: 1, scale: 3, decimals: 1 },
  { id: 'crp', category: 'lab', label: 'C-reactive protein', shortLabel: 'CRP', unit: 'mg/L', domain: 'infection', low: 0, high: 5, worse: 'up', noise: 5, scale: 50, decimals: 0 },
  { id: 'lactate', category: 'lab', label: 'Lactate', shortLabel: 'Lac', unit: 'mmol/L', domain: 'metabolic', low: 0.5, high: 2.0, worse: 'up', noise: 0.2, scale: 1, decimals: 1 },
  { id: 'inr', category: 'lab', label: 'INR', shortLabel: 'INR', unit: '', domain: 'hematologic', low: 0.8, high: 1.2, worse: 'up', noise: 0.1, scale: 0.5, decimals: 1 },
  { id: 'systolic_bp', category: 'vital', label: 'Systolic blood pressure', shortLabel: 'SBP', unit: 'mmHg', domain: 'hemodynamic', low: 100, high: 140, worse: 'down', noise: 4, scale: 15, decimals: 0 },
  { id: 'heart_rate', category: 'vital', label: 'Heart rate', shortLabel: 'HR', unit: '/min', domain: 'hemodynamic', low: 60, high: 100, worse: 'up', noise: 5, scale: 15, decimals: 0 },
  { id: 'respiratory_rate', category: 'vital', label: 'Respiratory rate', shortLabel: 'RR', unit: '/min', domain: 'respiratory', low: 12, high: 20, worse: 'up', noise: 1, scale: 4, decimals: 0 },
  { id: 'spo2', category: 'vital', label: 'Oxygen saturation', shortLabel: 'SpO₂', unit: '%', domain: 'respiratory', low: 94, worse: 'down', noise: 1, scale: 3, decimals: 0 },
  { id: 'oxygen_lpm', category: 'oxygen', label: 'Supplemental oxygen', shortLabel: 'O₂', unit: 'L/min', domain: 'respiratory', low: 0, high: 0, worse: 'up', noise: 0.4, scale: 2, decimals: 1 },
  { id: 'temperature', category: 'vital', label: 'Temperature', shortLabel: 'Temp', unit: '°C', domain: 'infection', low: 36.0, high: 37.8, worse: 'both', noise: 0.2, scale: 0.6, decimals: 1 },
  { id: 'urine_output', category: 'intake_output', label: 'Urine output', shortLabel: 'UO', unit: 'mL/h', domain: 'renal', low: 30, worse: 'down', noise: 5, scale: 15, decimals: 0 },
  { id: 'serum_osmolality', category: 'lab', label: 'Serum osmolality', shortLabel: 'sOsm', unit: 'mOsm/kg', domain: 'electrolyte', low: 275, high: 295, worse: 'both', noise: 3, scale: 10, decimals: 0 },
  { id: 'urine_osmolality', category: 'lab', label: 'Urine osmolality', shortLabel: 'uOsm', unit: 'mOsm/kg', domain: 'electrolyte', worse: 'both', noise: 20, scale: 100, decimals: 0 },
  { id: 'urine_sodium', category: 'lab', label: 'Urine sodium', shortLabel: 'uNa', unit: 'mmol/L', domain: 'electrolyte', worse: 'both', noise: 5, scale: 20, decimals: 0 },
  { id: 'tsh', category: 'lab', label: 'TSH', shortLabel: 'TSH', unit: 'mIU/L', domain: 'endocrine', low: 0.4, high: 4.0, worse: 'both', noise: 0.3, scale: 2, decimals: 1 },
  { id: 'cortisol', category: 'lab', label: 'Cortisol (am)', shortLabel: 'Cort', unit: 'nmol/L', domain: 'endocrine', low: 140, worse: 'down', noise: 20, scale: 100, decimals: 0 },
]

export const SIGNALS: Record<SignalId, SignalDefinition> = Object.fromEntries(
  defs.map((d) => [d.id, d]),
) as Record<SignalId, SignalDefinition>

export const SIGNAL_IDS = defs.map((d) => d.id)

/** Accepted alternative units per signal and the factor that converts them to the registry unit. */
const UNIT_CONVERSIONS: Partial<Record<SignalId, Record<string, (v: number) => number>>> = {
  glucose: { 'mmol/l': (v) => v * 18.016 },
  creatinine: { 'umol/l': (v) => v / 88.42, 'µmol/l': (v) => v / 88.42, 'μmol/l': (v) => v / 88.42 },
  urea: { 'mg/dl': (v) => v / 2.801 },
  hemoglobin: { 'g/l': (v) => v / 10 },
  temperature: { '°f': (v) => ((v - 32) * 5) / 9, 'f': (v) => ((v - 32) * 5) / 9 },
  lactate: { 'mg/dl': (v) => v / 9.008 },
}

const UNIT_ALIASES: Record<string, string> = { 'x10^9/l': '×10⁹/l', 'x10e9/l': '×10⁹/l', '10^9/l': '×10⁹/l', 'bpm': '/min', 'breaths/min': '/min', 'beats/min': '/min', 'l/min': 'l/min', 'ml/hr': 'ml/h', 'c': '°c', 'mosm/kg h2o': 'mosm/kg' }

function canonicalUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\s+/g, '')
  return UNIT_ALIASES[u] ?? u
}

/**
 * Converts an observed value to the registry unit for `id`. Returns null when the unit is
 * neither the registry unit nor a known convertible alternative.
 */
export function toRegistryUnit(id: SignalId, value: number, unit: string): number | null {
  const def = SIGNALS[id]
  const observed = canonicalUnit(unit)
  if (observed === canonicalUnit(def.unit) || (def.unit === '' && observed === '')) return value
  const convert = UNIT_CONVERSIONS[id]?.[observed]
  return convert ? convert(value) : null
}

export function formatValue(id: SignalId, value: number): string {
  const d = SIGNALS[id]
  return value.toFixed(d.decimals)
}

export function formatWithUnit(id: SignalId, value: number): string {
  const d = SIGNALS[id]
  return d.unit ? `${formatValue(id, value)} ${d.unit}` : formatValue(id, value)
}
