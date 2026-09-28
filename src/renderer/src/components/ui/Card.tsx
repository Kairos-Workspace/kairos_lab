import React from 'react'
import { Badge } from './Badge'
import { Icon, type IconName } from '../Icon'

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  stamp?: string
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: IconName
  actions?: React.ReactNode
  interactive?: boolean
  selected?: boolean
  children?: React.ReactNode
}

export function Card({
  stamp,
  title,
  description,
  icon,
  actions,
  interactive = false,
  selected = false,
  className = '',
  onClick,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const isClickable = interactive || Boolean(onClick)

  const classes = [
    'ui-card',
    isClickable ? 'ui-card-interactive' : '',
    selected ? 'ui-card-selected' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
              }
            }
          : undefined
      }
      {...rest}
    >
      {(stamp || icon) && (
        <div className="ui-card-top">
          {stamp && <Badge variant="stamp" size="sm">{stamp}</Badge>}
          {icon && <Icon name={icon} />}
        </div>
      )}

      {title && <h3 className="ui-card-title">{title}</h3>}
      {description && <p className="ui-card-description">{description}</p>}

      {children && <div className="ui-card-content">{children}</div>}

      {actions && <div className="ui-card-actions">{actions}</div>}
    </div>
  )
}
