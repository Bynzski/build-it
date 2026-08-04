import type { ReactNode } from 'react'
import { formatFeetInches } from '../domain/units'

interface FieldGroupProps {
  title: string
  description?: string
  children: ReactNode
}

export function FieldGroup({ title, description, children }: FieldGroupProps) {
  return (
    <section className="field-group">
      <div className="field-group-heading">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="field-group-content">{children}</div>
    </section>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  dimension?: boolean
  suffix?: string
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  dimension = false,
  suffix,
}: NumberFieldProps) {
  return (
    <label className="field-row">
      <span className="field-label">
        {label}
        {dimension ? <small>{formatFeetInches(value)}</small> : null}
      </span>
      <span className="number-control">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber
            if (Number.isFinite(next) && next >= min && next <= max) onChange(next)
          }}
        />
        {suffix ? <span>{suffix}</span> : null}
      </span>
    </label>
  )
}

interface SelectFieldProps<T extends string | number> {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <label className="field-row">
      <span className="field-label">{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const match = options.find((option) => String(option.value) === event.currentTarget.value)
          if (match) onChange(match.value)
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface ToggleFieldProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function ToggleField({ label, description, checked, onChange }: ToggleFieldProps) {
  return (
    <label className="toggle-field">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  )
}
