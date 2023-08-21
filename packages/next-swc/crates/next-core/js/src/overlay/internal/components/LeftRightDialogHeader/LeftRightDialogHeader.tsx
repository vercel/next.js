import * as React from 'react'
import { clsx } from '../../helpers/clsx'

export type LeftRightDialogHeaderProps = {
  hidden?: boolean
  previous?: (() => void) | null
  next?: (() => void) | null
  severity: 'warning' | 'error'
  className?: string
  children: React.ReactNode
}

export function LeftRightDialogHeader({
  hidden = false,
  previous,
  next,
  severity,
  className,
  children,
}: LeftRightDialogHeaderProps) {
  const buttonLeft = React.useRef<HTMLButtonElement | null>(null)
  const buttonRight = React.useRef<HTMLButtonElement | null>(null)

  const [nav, setNav] = React.useState<HTMLElement | null>(null)
  const onNav = React.useCallback((el: HTMLElement) => {
    setNav(el)
  }, [])

  React.useEffect(() => {
    if (nav == null || hidden) {
      return
    }

    const root = nav.getRootNode()
    const d = self.document

    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.stopPropagation()
        if (buttonLeft.current) {
          buttonLeft.current.focus()
        }
        previous && previous()
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation()
        if (buttonRight.current) {
          buttonRight.current.focus()
        }
        next && next()
      }
    }

    root.addEventListener('keydown', handler as EventListener)
    if (root !== d) {
      d.addEventListener('keydown', handler)
    }
    return function () {
      root.removeEventListener('keydown', handler as EventListener)
      if (root !== d) {
        d.removeEventListener('keydown', handler)
      }
    }
  }, [hidden, nav, next, previous])

  // Unlock focus for browsers like Firefox, that break all user focus if the
  // currently focused item becomes disabled.
  React.useEffect(() => {
    if (nav == null) {
      return
    }

    const root = nav.getRootNode()
    // Always true, but we do this for TypeScript:
    if (root instanceof ShadowRoot) {
      const a = root.activeElement

      if (previous == null) {
        if (buttonLeft.current && a === buttonLeft.current) {
          buttonLeft.current.blur()
        }
      } else if (next == null) {
        if (buttonRight.current && a === buttonRight.current) {
          buttonRight.current.blur()
        }
      }
    }
  }, [nav, next, previous])

  return (
    <nav
      ref={onNav}
      data-severity={severity}
      className={clsx('dialog-left-right', className)}
    >
      {children}
      &nbsp;
      <button
        ref={buttonLeft}
        type="button"
        disabled={previous == null ? true : undefined}
        aria-disabled={previous == null ? true : undefined}
        onClick={previous ?? undefined}
      >
        <ArrowLeft />
      </button>
      <button
        ref={buttonRight}
        type="button"
        disabled={next == null ? true : undefined}
        aria-disabled={next == null ? true : undefined}
        onClick={next ?? undefined}
      >
        <ArrowRight />
      </button>
    </nav>
  )
}

function ArrowLeft() {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6.99996 1.16666L1.16663 6.99999L6.99996 12.8333M12.8333 6.99999H1.99996H12.8333Z" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6.99996 1.16666L12.8333 6.99999L6.99996 12.8333M1.16663 6.99999H12H1.16663Z" />
    </svg>
  )
}
