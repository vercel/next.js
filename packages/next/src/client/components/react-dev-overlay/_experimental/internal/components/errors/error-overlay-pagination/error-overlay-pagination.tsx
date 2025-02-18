import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { noop as css } from '../../../helpers/noop-template'
import { LeftArrow } from '../../../icons/left-arrow'
import { RightArrow } from '../../../icons/right-arrow'
import type { ReadyRuntimeError } from '../../../../../internal/helpers/get-error-by-type'

type ErrorPaginationProps = {
  readyErrors: ReadyRuntimeError[]
  activeIdx: number
  onActiveIndexChange: (index: number) => void
}

export function ErrorOverlayPagination({
  readyErrors,
  activeIdx,
  onActiveIndexChange,
}: ErrorPaginationProps) {
  const handlePrevious = useCallback(
    () =>
      startTransition(() => {
        if (activeIdx > 0) {
          onActiveIndexChange(Math.max(0, activeIdx - 1))
        }
      }),
    [activeIdx, onActiveIndexChange]
  )

  const handleNext = useCallback(
    () =>
      startTransition(() => {
        if (activeIdx < readyErrors.length - 1) {
          onActiveIndexChange(
            Math.max(0, Math.min(readyErrors.length - 1, activeIdx + 1))
          )
        }
      }),
    [activeIdx, readyErrors.length, onActiveIndexChange]
  )

  const buttonLeft = useRef<HTMLButtonElement | null>(null)
  const buttonRight = useRef<HTMLButtonElement | null>(null)

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
        handlePrevious && handlePrevious()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        handleNext && handleNext()
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
    <nav
      className="error-overlay-pagination dialog-exclude-closing-from-outside-click"
      ref={onNav}
    >
      <button
        ref={buttonLeft}
        type="button"
        disabled={activeIdx === 0}
        aria-disabled={activeIdx === 0}
        onClick={handlePrevious}
        data-nextjs-dialog-error-previous
        className="error-overlay-pagination-button"
      >
        <LeftArrow
          title="previous"
          className="error-overlay-pagination-button-icon"
        />
      </button>
      <div className="error-overlay-pagination-count">
        <span data-nextjs-dialog-error-index={activeIdx}>{activeIdx + 1}/</span>
        <span data-nextjs-dialog-header-total-count>
          {/* Display 1 out of 1 if there are no errors (e.g. for build errors). */}
          {readyErrors.length || 1}
        </span>
      </div>
      <button
        ref={buttonRight}
        type="button"
        // If no errors or the last error is active, disable the button.
        disabled={activeIdx >= readyErrors.length - 1}
        aria-disabled={activeIdx >= readyErrors.length - 1}
        onClick={handleNext}
        data-nextjs-dialog-error-next
        className="error-overlay-pagination-button"
      >
        <RightArrow
          title="next"
          className="error-overlay-pagination-button-icon"
        />
      </button>
    </nav>
  )
}

export const styles = css`
  .error-overlay-pagination {
    -webkit-font-smoothing: antialiased;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    width: fit-content;
  }

  .error-overlay-pagination-count {
    color: var(--color-gray-900);
    text-align: center;
    font-size: var(--size-font-small);
    font-weight: 500;
    line-height: 16px;
    font-variant-numeric: tabular-nums;
  }

  .error-overlay-pagination-button {
    display: flex;
    justify-content: center;
    align-items: center;

    width: 24px;
    height: 24px;
    background: var(--color-gray-300);
    flex-shrink: 0;

    border: none;
    border-radius: var(--rounded-full);

    &:focus-visible {
      outline: var(--focus-ring);
    }

    &:not(:disabled):active {
      background: var(--color-gray-500);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .error-overlay-pagination-button-icon {
    color: var(--color-gray-1000);
  }
`
