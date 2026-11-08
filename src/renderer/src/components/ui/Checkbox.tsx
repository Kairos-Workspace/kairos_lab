import React, { useId } from 'react'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, description, error, className = '', id, disabled, ...rest }, ref) {
    const generatedId = useId()
    const inputId = id ?? generatedId

    return (
      <label
        htmlFor={inputId}
        className={`ui-checkbox ${disabled ? 'ui-checkbox-disabled' : ''} ${error ? 'ui-checkbox-error' : ''} ${className}`}
        onClick={(e) => {
          if (disabled) {
            e.preventDefault()
          }
        }}
      >
        <span className="ui-checkbox-control">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            disabled={disabled}
            className="ui-checkbox-input"
            {...rest}
          />
          <span className="ui-checkbox-box" aria-hidden="true">
            <svg
              className="ui-checkbox-icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
            </svg>
          </span>
        </span>
        {(label || description) && (
          <span className="ui-checkbox-label-group">
            {label && <span className="ui-checkbox-label">{label}</span>}
            {description && <span className="ui-checkbox-desc">{description}</span>}
          </span>
        )}
      </label>
    )
  }
)
