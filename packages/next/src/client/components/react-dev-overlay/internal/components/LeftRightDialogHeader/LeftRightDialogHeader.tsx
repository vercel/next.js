import * as React from 'react'
import { CloseIcon } from '../../icons/CloseIcon'

export type LeftRightDialogHeaderProps = {
  children?: React.ReactNode
  className?: string
  previous: (() => void) | null
  next: (() => void) | null
  close?: () => void
}

const LeftRightDialogHeader: React.FC<LeftRightDialogHeaderProps> =
  function LeftRightDialogHeader({
    children,
    className,
    previous,
    next,
    close,
  }) {
    const buttonLeft = React.useRef<HTMLButtonElement | null>(null)
    const buttonRight = React.useRef<HTMLButtonElement | null>(null)
    const buttonClose = React.useRef<HTMLButtonElement | null>(null)

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
            if (a && a !== buttonClose.current && a instanceof HTMLElement) {
              a.blur()
              return
            }
          }

          if (close) {
            close()
          }
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
      <div data-nextjs-dialog-left-right className={className}>
        <nav ref={onNav}>
          <button
            ref={buttonLeft}
            type="button"
            disabled={previous == null ? true : undefined}
            aria-disabled={previous == null ? true : undefined}
            onClick={previous ?? undefined}
          >
            <svg
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>previous</title>
              <path
                d="M6.99996 1.16666L1.16663 6.99999L6.99996 12.8333M12.8333 6.99999H1.99996H12.8333Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            ref={buttonRight}
            type="button"
            disabled={next == null ? true : undefined}
            aria-disabled={next == null ? true : undefined}
            onClick={next ?? undefined}
          >
            <svg
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>next</title>
              <path
                d="M6.99996 1.16666L12.8333 6.99999L6.99996 12.8333M1.16663 6.99999H12H1.16663Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          &nbsp;
          {children}
        </nav>
        {close ? (
          <button
            data-nextjs-errors-dialog-left-right-close-button
            ref={buttonClose}
            type="button"
            onClick={close}
            aria-label="Close"
          >
            <span aria-hidden="true">
              <CloseIcon />
            </span>
          </button>
        ) : null}
      </div>
    )
  }

export { LeftRightDialogHeader }
