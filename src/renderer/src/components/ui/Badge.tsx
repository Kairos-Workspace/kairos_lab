import React from 'react'
import { Icon, type IconName } from '../Icon'

export type BadgeVariant = 'stamp' | 'brand' | 'bull' | 'bear' | 'muted' | 'neutral'
export type BadgeSize = 'sm' | 'md'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  icon?: IconName
  children: React.ReactNode
}

export function Badge({
  variant = 'stamp',
  size = 'md',
  icon,
  className = '',
  children,
  ...rest
}: BadgeProps): React.JSX.Element {
  const classes = [
    'ui-badge',
    `ui-badge-${variant}`,
    `ui-badge-${size}`,
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} {...rest}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </span>
  )
}
