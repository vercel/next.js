import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LeftArrow } from '../../../icons/LeftArrow'
import { RightArrow } from '../../../icons/RightArrow'

type ErrorPaginationProps = {
  activeIdx: number
  previous: () => void
  next: () => void
  readyErrors: ReadyRuntimeError[]
  minimize: () => void
  isServerError: boolean
}

export function ErrorPagination({
  activeIdx,
  previous,
  next,
  readyErrors,
  minimize,
  isServerError,
}: ErrorPaginationProps) {
  const previousHandler = activeIdx > 0 ? previous : null
  const nextHandler = activeIdx < readyErrors.length - 1 ? next : null
  const close = isServerError ? undefined : minimize

  const buttonLeft = useRef<HTMLButtonElement | null>(null)
  const buttonRight = useRef<HTMLButtonElement | null>(null)
  const buttonClose = useRef<HTMLButtonElement | null>(null)

  const [nav, setNav] = useState<HTMLElement | null>(null)
  const onNav = useCallback((el: HTMLElement) => {
    setNav(el)
  }, [])

  useEffect(() => {
    if (nav == null) {
      return
    }

    const root = nav.getRootNode()
    const d = self.document

    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        if (buttonLeft.current) {
          buttonLeft.current.focus()
        }
        previousHandler && previousHandler()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        if (buttonRight.current) {
          buttonRight.current.focus()
        }
        nextHandler && nextHandler()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (root instanceof ShadowRoot) {
          const a = root.activeElement
          if (a && a !== buttonClose.current && a instanceof HTMLElement) {
            a.blur()
            return
          }
        }

        close?.()
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
  }, [close, nav, nextHandler, previousHandler])

  // Unlock focus for browsers like Firefox, that break all user focus if the
  // currently focused item becomes disabled.
  useEffect(() => {
    if (nav == null) {
      return
    }

    const root = nav.getRootNode()
    // Always true, but we do this for TypeScript:
    if (root instanceof ShadowRoot) {
      const a = root.activeElement

      if (previousHandler == null) {
        if (buttonLeft.current && a === buttonLeft.current) {
          buttonLeft.current.blur()
        }
      } else if (nextHandler == null) {
        if (buttonRight.current && a === buttonRight.current) {
          buttonRight.current.blur()
        }
      }
    }
  }, [nav, nextHandler, previousHandler])

  return (
    <div data-nextjs-dialog-left-right>
      <nav ref={onNav}>
        <button
          ref={buttonLeft}
          type="button"
          disabled={previousHandler == null ? true : undefined}
          aria-disabled={previousHandler == null ? true : undefined}
          onClick={previousHandler ?? undefined}
        >
          <LeftArrow title="previous" />
        </button>
        <button
          ref={buttonRight}
          type="button"
          disabled={nextHandler == null ? true : undefined}
          aria-disabled={nextHandler == null ? true : undefined}
          onClick={nextHandler ?? undefined}
        >
          <RightArrow title="next" />
        </button>
        <small>
          <span>{activeIdx + 1}</span> of{' '}
          <span data-nextjs-dialog-header-total-count>
            {readyErrors.length}
          </span>
          {' issue'}
          {readyErrors.length < 2 ? '' : 's'}
        </small>
      </nav>
    </div>
  )
}
