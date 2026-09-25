import type { SignalDefinition, SignalId } from './types'

const defs: SignalDefinition[] = [
  { id: 'sodium', label: 'Sodium', shortLabel: 'Na', unit: 'mmol/L', domain: 'electrolyte', low: 135, high: 145, worse: 'both', noise: 1, scale: 5, decimals: 0 },
  { id: 'potassium', label: 'Potassium', shortLabel: 'K', unit: 'mmol/L', domain: 'electrolyte', low: 3.5, high: 5.0, worse: 'both', noise: 0.2, scale: 0.5, decimals: 1 },
  { id: 'creatinine', label: 'Creatinine', shortLabel: 'Cr', unit: 'mg/dL', domain: 'renal', low: 0.6, high: 1.2, worse: 'up', noise: 0.1, scale: 0.3, decimals: 2 },
  { id: 'urea', label: 'Urea', shortLabel: 'Urea', unit: 'mmol/L', domain: 'renal', low: 2.5, high: 7.8, worse: 'up', noise: 0.5, scale: 3, decimals: 1 },
  { id: 'bicarbonate', label: 'Bicarbonate', shortLabel: 'HCO3', unit: 'mmol/L', domain: 'metabolic', low: 22, high: 29, worse: 'down', noise: 1, scale: 3, decimals: 0 },
  { id: 'glucose', label: 'Glucose', shortLabel: 'Glu', unit: 'mg/dL', domain: 'metabolic', low: 70, high: 140, worse: 'both', noise: 10, scale: 40, decimals: 0 },
  { id: 'hemoglobin', label: 'Haemoglobin', shortLabel: 'Hb', unit: 'g/dL', domain: 'hematologic', low: 12, high: 16, worse: 'down', noise: 0.4, scale: 1, decimals: 1 },
  { id: 'platelets', label: 'Platelets', shortLabel: 'Plt', unit: '×10⁹/L', domain: 'hematologic', low: 150, high: 400, worse: 'down', noise: 15, scale: 50, decimals: 0 },
  { id: 'wbc', label: 'White cell count', shortLabel: 'WBC', unit: '×10⁹/L', domain: 'infection', low: 4, high: 11, worse: 'up', noise: 1, scale: 3, decimals: 1 },
  { id: 'crp', label: 'C-reactive protein', shortLabel: 'CRP', unit: 'mg/L', domain: 'infection', low: 0, high: 5, worse: 'up', noise: 5, scale: 50, decimals: 0 },
  { id: 'lactate', label: 'Lactate', shortLabel: 'Lac', unit: 'mmol/L', domain: 'metabolic', low: 0.5, high: 2.0, worse: 'up', noise: 0.2, scale: 1, decimals: 1 },
  { id: 'inr', label: 'INR', shortLabel: 'INR', unit: '', domain: 'hematologic', low: 0.8, high: 1.2, worse: 'up', noise: 0.1, scale: 0.5, decimals: 1 },
  { id: 'systolic_bp', label: 'Systolic blood pressure', shortLabel: 'SBP', unit: 'mmHg', domain: 'hemodynamic', low: 100, high: 140, worse: 'down', noise: 4, scale: 15, decimals: 0 },
  { id: 'heart_rate', label: 'Heart rate', shortLabel: 'HR', unit: '/min', domain: 'hemodynamic', low: 60, high: 100, worse: 'up', noise: 5, scale: 15, decimals: 0 },
  { id: 'respiratory_rate', label: 'Respiratory rate', shortLabel: 'RR', unit: '/min', domain: 'respiratory', low: 12, high: 20, worse: 'up', noise: 1, scale: 4, decimals: 0 },
  { id: 'spo2', label: 'Oxygen saturation', shortLabel: 'SpO₂', unit: '%', domain: 'respiratory', low: 94, worse: 'down', noise: 1, scale: 3, decimals: 0 },
  { id: 'oxygen_lpm', label: 'Supplemental oxygen', shortLabel: 'O₂', unit: 'L/min', domain: 'respiratory', low: 0, high: 0, worse: 'up', noise: 0.4, scale: 2, decimals: 1 },
  { id: 'temperature', label: 'Temperature', shortLabel: 'Temp', unit: '°C', domain: 'infection', low: 36.0, high: 37.8, worse: 'both', noise: 0.2, scale: 0.6, decimals: 1 },
  { id: 'urine_output', label: 'Urine output', shortLabel: 'UO', unit: 'mL/h', domain: 'renal', low: 30, worse: 'down', noise: 5, scale: 15, decimals: 0 },
  { id: 'serum_osmolality', label: 'Serum osmolality', shortLabel: 'sOsm', unit: 'mOsm/kg', domain: 'electrolyte', low: 275, high: 295, worse: 'both', noise: 3, scale: 10, decimals: 0 },
  { id: 'urine_osmolality', label: 'Urine osmolality', shortLabel: 'uOsm', unit: 'mOsm/kg', domain: 'electrolyte', worse: 'both', noise: 20, scale: 100, decimals: 0 },
  { id: 'urine_sodium', label: 'Urine sodium', shortLabel: 'uNa', unit: 'mmol/L', domain: 'electrolyte', worse: 'both', noise: 5, scale: 20, decimals: 0 },
  { id: 'tsh', label: 'TSH', shortLabel: 'TSH', unit: 'mIU/L', domain: 'endocrine', low: 0.4, high: 4.0, worse: 'both', noise: 0.3, scale: 2, decimals: 1 },
  { id: 'cortisol', label: 'Cortisol (am)', shortLabel: 'Cort', unit: 'nmol/L', domain: 'endocrine', low: 140, worse: 'down', noise: 20, scale: 100, decimals: 0 },
]

export const SIGNALS: Record<SignalId, SignalDefinition> = Object.fromEntries(
  defs.map((d) => [d.id, d]),
) as Record<SignalId, SignalDefinition>

export const SIGNAL_IDS = defs.map((d) => d.id)

export function formatValue(id: SignalId, value: number): string {
  const d = SIGNALS[id]
  return value.toFixed(d.decimals)
}

export function formatWithUnit(id: SignalId, value: number): string {
  const d = SIGNALS[id]
  return d.unit ? `${formatValue(id, value)} ${d.unit}` : formatValue(id, value)
}
