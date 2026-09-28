import React, { useId } from 'react'

export interface FormFieldProps {
  label?: string
  hint?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  optional?: boolean
  htmlFor?: string
  className?: string
  children: React.ReactNode
}

export function FormField({
  label,
  hint,
  error,
  required = false,
  optional = false,
  htmlFor,
  className = '',
  children
}: FormFieldProps): React.JSX.Element {
  const generatedId = useId()
  const fieldId = htmlFor ?? (label ? generatedId : undefined)

  return (
    <div className={`ui-field ${error ? 'ui-field-has-error' : ''} ${className}`}>
      {label && (
        <div className="ui-field-header">
          <label htmlFor={fieldId} className="ui-field-label">
            {label}
            {required && <span className="ui-field-required" title="Required">*</span>}
            {optional && <span className="ui-field-optional">(optional)</span>}
          </label>
        </div>
      )}
      <div className="ui-field-control">
        {React.isValidElement<{ id?: string }>(children) && fieldId && !children.props.id
          ? React.cloneElement(children, { id: fieldId })
          : children}
      </div>
      {hint && !error && <div className="ui-field-hint">{hint}</div>}
      {error && <div className="ui-field-error" role="alert">{error}</div>}
    </div>
  )
}
