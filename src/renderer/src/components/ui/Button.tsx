import React from 'react'
import { Icon, type IconName } from '../Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconPosition?: 'left' | 'right'
  loading?: boolean
  fullWidth?: boolean
  children?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconPosition = 'left',
    loading = false,
    fullWidth = false,
    disabled,
    className = '',
    children,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading

  const baseClasses = [
    'ui-btn',
    `ui-btn-${variant}`,
    `ui-btn-${size}`,
    icon && !children ? 'ui-btn-icon-only' : '',
    icon && children ? 'ui-btn-with-icon' : '',
    fullWidth ? 'ui-btn-block' : '',
    loading ? 'ui-btn-loading' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button ref={ref} className={baseClasses} disabled={isDisabled} {...rest}>
      {loading ? (
        <span className="ui-btn-spinner" aria-hidden="true" />
      ) : (
        icon && iconPosition === 'left' && <Icon name={icon} />
      )}
      {children && <span className="ui-btn-content">{children}</span>}
      {!loading && icon && iconPosition === 'right' && <Icon name={icon} />}
    </button>
  )
})
