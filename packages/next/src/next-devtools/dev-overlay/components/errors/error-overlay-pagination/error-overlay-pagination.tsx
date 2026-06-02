import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { LeftArrow } from '../../../icons/left-arrow'
import { RightArrow } from '../../../icons/right-arrow'
import type { ReadyRuntimeError } from '../../../utils/get-error-by-type'

export type ErrorOverlayPaginationControls = {
  previousButton: React.ReactNode
  nextButton: React.ReactNode
  createCount: (
    activeIdx: number,
    total: number,
    isActive?: boolean
  ) => React.ReactNode
}

export type ErrorOverlayTabBarRenderer = (
  controls: ErrorOverlayPaginationControls
) => React.ReactNode

type ErrorPaginationProps = {
  runtimeErrors: ReadyRuntimeError[]
  activeIdx: number
  onActiveIndexChange: (index: number) => void
  canGoPrevious?: boolean
  canGoNext?: boolean
  onPrevious?: () => void
  onNext?: () => void
  renderTabBar?: ErrorOverlayTabBarRenderer
}

export function ErrorOverlayPagination({
  runtimeErrors,
  activeIdx,
  onActiveIndexChange,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  renderTabBar,
}: ErrorPaginationProps) {
  const handlePreviousWithinGroup = useCallback(
    () =>
      startTransition(() => {
        if (activeIdx > 0) {
          onActiveIndexChange(Math.max(0, activeIdx - 1))
        }
      }),
    [activeIdx, onActiveIndexChange]
  )

  const handleNextWithinGroup = useCallback(
    () =>
      startTransition(() => {
        if (activeIdx < runtimeErrors.length - 1) {
          onActiveIndexChange(
            Math.max(0, Math.min(runtimeErrors.length - 1, activeIdx + 1))
          )
        }
      }),
    [activeIdx, runtimeErrors.length, onActiveIndexChange]
  )

  const canNavigatePrevious = canGoPrevious ?? activeIdx > 0
  const canNavigateNext = canGoNext ?? activeIdx < runtimeErrors.length - 1

  const handlePrevious = onPrevious ?? handlePreviousWithinGroup
  const handleNext = onNext ?? handleNextWithinGroup

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

      if (!canNavigatePrevious) {
        if (buttonLeft.current && a === buttonLeft.current) {
          buttonLeft.current.blur()
        }
      } else if (!canNavigateNext) {
        if (buttonRight.current && a === buttonRight.current) {
          buttonRight.current.blur()
        }
      }
    }
  }, [nav, canNavigateNext, canNavigatePrevious])

  const previousButton = (
    <button
      ref={buttonLeft}
      type="button"
      disabled={!canNavigatePrevious}
      aria-disabled={!canNavigatePrevious}
      onClick={handlePrevious}
      data-nextjs-dialog-error-previous
      className="error-overlay-pagination-button"
    >
      <LeftArrow
        title="previous"
        className="error-overlay-pagination-button-icon"
      />
    </button>
  )

  const createCount = (
    currentActiveIdx: number,
    total: number,
    isActive: boolean = true
  ) => (
    <div className="error-overlay-pagination-count">
      <span
        {...(isActive
          ? { 'data-nextjs-dialog-error-index': currentActiveIdx }
          : {})}
      >
        {total === 0 ? 0 : currentActiveIdx + 1}/
      </span>
      <span
        {...(isActive ? { 'data-nextjs-dialog-header-total-count': '' } : {})}
      >
        {total}
      </span>
    </div>
  )

  const nextButton = (
    <button
      ref={buttonRight}
      type="button"
      disabled={!canNavigateNext}
      aria-disabled={!canNavigateNext}
      onClick={handleNext}
      data-nextjs-dialog-error-next
      className="error-overlay-pagination-button"
    >
      <RightArrow
        title="next"
        className="error-overlay-pagination-button-icon"
      />
    </button>
  )

  return (
    <nav
      className="error-overlay-pagination dialog-exclude-closing-from-outside-click"
      ref={onNav}
    >
      {renderTabBar ? (
        renderTabBar({ previousButton, createCount, nextButton })
      ) : (
        <>
          {previousButton}
          {createCount(activeIdx, runtimeErrors.length || 1)}
          {nextButton}
        </>
      )}
    </nav>
  )
}

export const styles = `
  .error-overlay-pagination {
    -webkit-font-smoothing: antialiased;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    width: fit-content;
  }

  @media (max-width: 575px) {
    .error-overlay-pagination {
      gap: 4px;
    }
  }

  .error-overlay-pagination-count {
    display: flex;
    align-items: center;
    color: inherit;
    text-align: center;
    font-size: var(--size-13);
    font-family: var(--font-mono);
    line-height: var(--size-16);
    font-variant-numeric: tabular-nums;
  }

  .error-overlay-pagination-button {
    display: flex;
    justify-content: center;
    align-items: center;

    width: var(--size-24);
    height: var(--size-24);
    background: none;
    flex-shrink: 0;

    border: none;
    border-radius: var(--rounded-full);

    svg {
      width: var(--size-16);
      height: var(--size-16);
    }

    &:focus-visible {
      outline: var(--focus-ring);
    }

    &:not(:disabled):hover {
      background: var(--color-gray-alpha-100);
    }

    &:not(:disabled):active {
      background: var(--color-gray-alpha-200);
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
