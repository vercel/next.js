import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LeftArrow } from '../../../icons/LeftArrow'
import { RightArrow } from '../../../icons/RightArrow'

type ErrorPaginationProps = {
  readyErrors: ReadyRuntimeError[]
  activeIdx: number
  onActiveIndexChange: (index: number) => void
}

export function ErrorPagination({
  readyErrors,
  activeIdx,
  onActiveIndexChange,
}: ErrorPaginationProps) {
  const handlePrevious = useCallback(
    () =>
      activeIdx > 0 ? onActiveIndexChange(Math.max(0, activeIdx - 1)) : null,
    [activeIdx, onActiveIndexChange]
  )

  const handleNext = useCallback(
    () =>
      activeIdx < readyErrors.length - 1
        ? onActiveIndexChange(
            Math.max(0, Math.min(readyErrors.length - 1, activeIdx + 1))
          )
        : null,
    [activeIdx, readyErrors.length, onActiveIndexChange]
  )

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
        handlePrevious && handlePrevious()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        if (buttonRight.current) {
          buttonRight.current.focus()
        }
        handleNext && handleNext()
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
  }, [nav, handleNext, handlePrevious])

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

      if (activeIdx === 0) {
        if (buttonLeft.current && a === buttonLeft.current) {
          buttonLeft.current.blur()
        }
      } else if (activeIdx === readyErrors.length - 1) {
        if (buttonRight.current && a === buttonRight.current) {
          buttonRight.current.blur()
        }
      }
    }
  }, [nav, activeIdx, readyErrors.length])

  return (
    <div
      data-nextjs-dialog-left-right
      className="dialog-exclude-closing-from-outside-click"
    >
      <nav ref={onNav}>
        <button
          ref={buttonLeft}
          type="button"
          disabled={activeIdx === 0}
          aria-disabled={activeIdx === 0}
          onClick={handlePrevious}
        >
          <LeftArrow title="previous" />
        </button>
        <button
          ref={buttonRight}
          type="button"
          disabled={activeIdx === readyErrors.length - 1}
          aria-disabled={activeIdx === readyErrors.length - 1}
          onClick={handleNext}
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
