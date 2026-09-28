import React, { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import { Badge } from './Badge'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  stamp?: string
  subtitle?: React.ReactNode
  size?: ModalSize
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  closeOnBackdropClick?: boolean
  closeOnEscape?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  stamp,
  subtitle,
  size = 'md',
  children,
  footer,
  className = '',
  closeOnBackdropClick = true,
  closeOnEscape = true
}: ModalProps): React.JSX.Element | null {
  const titleId = useId()

  useEffect(() => {
    if (!open || !closeOnEscape) return

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeOnEscape, onClose])

  if (!open) return null

  const modalContent = (
    <div
      className="ui-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onMouseDown={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className={`ui-modal-container ui-modal-${size} ${className}`}>
        {(title || stamp || subtitle) && (
          <header className="ui-modal-header">
            <div className="ui-modal-titles">
              {stamp && <Badge variant="stamp" size="sm" className="ui-modal-stamp">{stamp}</Badge>}
              {title && (
                <h2 id={titleId} className="ui-modal-title">
                  {title}
                </h2>
              )}
              {subtitle && <p className="ui-modal-subtitle">{subtitle}</p>}
            </div>
            <button
              type="button"
              className="ui-icon-btn ui-icon-btn-ghost ui-modal-close"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <Icon name="close" />
            </button>
          </header>
        )}

        <div className="ui-modal-body">{children}</div>

        {footer && <footer className="ui-modal-footer">{footer}</footer>}
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
