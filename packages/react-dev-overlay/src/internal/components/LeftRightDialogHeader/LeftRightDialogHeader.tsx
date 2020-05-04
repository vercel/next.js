import * as React from 'react'

export type LeftRightDialogHeaderProps = {
  className?: string
  previous: (() => void) | null
  next: (() => void) | null
  close: () => void
}

const LeftRightDialogHeader: React.FC<LeftRightDialogHeaderProps> = function LeftRightDialogHeader({
  children,
  className,
  previous,
  next,
  close,
}) {
  const buttonLeft = React.useRef<HTMLButtonElement>()
  const buttonRight = React.useRef<HTMLButtonElement>()
  const buttonClose = React.useRef<HTMLButtonElement>()

  const [nav, setNav] = React.useState<HTMLElement | null>(null)
  const onNav = React.useCallback((el: HTMLElement) => {
    setNav(el)
  }, [])

  React.useEffect(() => {
    if (nav == null) {
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
      } else if (e.key === 'Escape') {
        e.stopPropagation()
        if (root instanceof ShadowRoot) {
          const a = root.activeElement
          if (a !== buttonClose.current && a instanceof HTMLElement) {
            if (buttonClose.current) {
              buttonClose.current.focus()
            } else {
              a.blur()
            }
            return
          }
        }

        close()
      }
    }

    root.addEventListener('keydown', handler)
    if (root !== d) {
      d.addEventListener('keydown', handler)
    }
    return function() {
      root.removeEventListener('keydown', handler)
      if (root !== d) {
        d.removeEventListener('keydown', handler)
      }
    }
  }, [close, nav, next, previous])

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
        if (a === buttonLeft.current) {
          buttonLeft.current.blur()
        }
      } else if (next == null) {
        if (a === buttonRight.current) {
          buttonRight.current.blur()
        }
      }
    }
  }, [nav, next, previous])

  return (
    <div data-nextjs-dialog-left-right className={className}>
      <nav ref={onNav}>
        <button
          ref={buttonLeft}
          type="button"
          disabled={previous == null ? true : undefined}
          aria-disabled={previous == null ? true : undefined}
          onClick={previous ?? undefined}
        >
          &larr;
        </button>
        <button
          ref={buttonRight}
          type="button"
          disabled={next == null ? true : undefined}
          aria-disabled={next == null ? true : undefined}
          onClick={next ?? undefined}
        >
          &rarr;
        </button>
        &nbsp;
        {children}
      </nav>
      <button
        ref={buttonClose}
        type="button"
        onClick={close}
        aria-label="Close"
      >
        <span aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </span>
      </button>
    </div>
  )
}

export { LeftRightDialogHeader }
