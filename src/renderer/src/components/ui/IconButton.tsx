import React from 'react'
import { Icon, type IconName } from '../Icon'

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  active?: boolean
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      variant = 'ghost',
      size = 'md',
      active = false,
      className = '',
      ...rest
    },
    ref
  ) {
    const classes = [
      'ui-icon-btn',
      `ui-icon-btn-${variant}`,
      `ui-icon-btn-${size}`,
      className
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        ref={ref}
        type="button"
        className={classes}
        title={label}
        aria-label={label}
        data-active={active ? 'true' : undefined}
        {...rest}
      >
        <Icon name={icon} />
      </button>
    )
  }
)
