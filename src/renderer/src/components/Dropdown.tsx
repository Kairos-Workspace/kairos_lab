import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption<T extends string | number> {
  value: T
  label: string
}

export function Dropdown<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  placement = 'bottom',
  menuMinWidth
}: {
  value: T
  onChange: (value: T) => void
  options: DropdownOption<T>[]
  ariaLabel?: string
  className?: string
  placement?: 'top' | 'bottom'
  menuMinWidth?: number
}): React.JSX.Element {
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
  } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)

  function openMenu(): void {
    const el = triggerRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const width = Math.max(box.width, menuMinWidth ?? box.width)
    const left = Math.min(box.left, Math.max(8, window.innerWidth - width - 8))
    if (placement === 'top') {
      setRect({
        bottom: window.innerHeight - box.top + 4,
        left,
        width
      })
    } else {
      setRect({ top: box.bottom + 4, left, width })
    }
    setActiveIndex(selectedIndex)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(event: MouseEvent): void {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    function onScrollOrResize(event: Event): void {
      // Scrolling the option list itself (e.g. scrollIntoView when opening
      // or arrow-key navigating to an off-screen option) fires a capture-
      // phase 'scroll' event too, even though scroll doesn't bubble — don't
      // treat that as "the page scrolled out from under the trigger".
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function commit(index: number): void {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openMenu()
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(options.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(options.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      commit(activeIndex)
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false)
    }
  }

  const current = options.find((o) => o.value === value)

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={className ? `dropdown-trigger ${className}` : 'dropdown-trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {current?.label ?? ''}
      </button>
      {open && rect
        ? createPortal(
            <ul
              ref={listRef}
              id={listboxId}
              className="dropdown-menu"
              role="listbox"
              aria-label={ariaLabel}
              style={{
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width
              }}
            >
              {options.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  className="dropdown-option"
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                >
                  {option.label}
                </li>
              ))}
            </ul>,
            document.body
          )
        : null}
    </>
  )
}
