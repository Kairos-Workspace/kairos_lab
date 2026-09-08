import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'

interface Props {
  icon: IconName
  label: string
  confirmLabel: string
  onConfirm: () => void
  className?: string
}

const ARM_TIMEOUT_MS = 3000

export function ConfirmIconButton({
  icon,
  label,
  confirmLabel,
  onConfirm,
  className
}: Props): React.JSX.Element {
  const [armed, setArmed] = useState(false)
  const timeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  function disarm(): void {
    window.clearTimeout(timeoutRef.current)
    setArmed(false)
  }

  function handleClick(event: React.MouseEvent): void {
    event.stopPropagation()
    if (!armed) {
      setArmed(true)
      timeoutRef.current = window.setTimeout(disarm, ARM_TIMEOUT_MS)
      return
    }
    disarm()
    onConfirm()
  }

  return (
    <button
      type="button"
      className={`icon-btn danger${className ? ` ${className}` : ''}`}
      data-armed={armed}
      onClick={handleClick}
      onBlur={disarm}
      title={armed ? confirmLabel : label}
      aria-label={armed ? confirmLabel : label}
    >
      <Icon name={icon} />
    </button>
  )
}
