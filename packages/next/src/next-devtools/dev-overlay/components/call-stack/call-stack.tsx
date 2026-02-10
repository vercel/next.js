import type { OriginalStackFrame } from '../../../shared/stack-frame'

import { CallStackFrame } from '../call-stack-frame/call-stack-frame'
import { ChevronUpDownIcon } from '../../icons/chevron-up-down'
import { css } from '../../utils/css'
import { useOpenInEditor } from '../../utils/use-open-in-editor'
import { useRef } from 'react'

/**
 * If there are no frames, just return -1
 * Ensure we don't start out-of-bounds
 */
function findNextSelectableFrameIndex(
  frames: readonly OriginalStackFrame[],
  startIndex: number | null,
  isIgnoreListOpen: boolean,
  direction: 1 | -1
): number | null {
  const length = frames.length

  if (length === 0) {
    return null
  }
  if (startIndex === null) {
    return direction === 1 ? 0 : length - 1
  }

  let nextIndex = startIndex

  do {
    nextIndex = (nextIndex + direction + length) % length
    const frame = frames[nextIndex]
    const hasSource = Boolean(frame.originalCodeFrame)
    if (hasSource && (!frame.ignored || isIgnoreListOpen)) {
      return nextIndex
    }
  } while (nextIndex !== startIndex)

  return null
}

export function CallStack({
  frames,
  isIgnoreListOpen,
  ignoredFramesTally,
  onToggleIgnoreList,
  selectedFrameIndex,
  onFrameSelect,
  tabGroupId,
}: {
  frames: readonly OriginalStackFrame[]
  isIgnoreListOpen: boolean
  ignoredFramesTally: number
  onToggleIgnoreList: () => void
  selectedFrameIndex: number | null
  onFrameSelect: (index: number) => void
  tabGroupId: string
}) {
  const selectedFrame =
    selectedFrameIndex !== null ? frames[selectedFrameIndex] : null
  const anyFrame =
    selectedFrame !== null
      ? (selectedFrame.originalStackFrame ?? selectedFrame.sourceStackFrame)
      : null
  const hasSource = Boolean(selectedFrame?.originalCodeFrame)
  const open = useOpenInEditor(
    hasSource && anyFrame !== null
      ? {
          file: anyFrame.file,
          line1: anyFrame.line1 ?? 1,
          column1: anyFrame.column1 ?? 1,
        }
      : undefined
  )

  const containerRef = useRef<HTMLDivElement | null>(null)

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    let nextIndex: number | null = null
    switch (event.key) {
      case 'ArrowDown': {
        nextIndex = findNextSelectableFrameIndex(
          frames,
          selectedFrameIndex,
          isIgnoreListOpen,
          1
        )

        break
      }
      case 'ArrowUp': {
        nextIndex = findNextSelectableFrameIndex(
          frames,
          selectedFrameIndex,
          isIgnoreListOpen,
          -1
        )

        break
      }
      case 'Home': {
        nextIndex = findNextSelectableFrameIndex(
          frames,
          frames.length - 1,
          isIgnoreListOpen,
          1
        )
        break
      }
      case 'End': {
        nextIndex = findNextSelectableFrameIndex(
          frames,
          0,
          isIgnoreListOpen,
          -1
        )
        break
      }
      case 'Enter':
      case ' ': {
        if (event.metaKey && selectedFrame !== null) {
          event.preventDefault()
          open()
        }

        break
      }

      default:
        break
    }

    if (nextIndex !== null && nextIndex !== selectedFrameIndex) {
      event.preventDefault()
      onFrameSelect(nextIndex)
      const container = containerRef.current!
      const nextTab = container.querySelector<HTMLButtonElement>(
        `#${tabGroupId}-tab-${nextIndex}`
      )!

      // nextTab.scrollIntoView({ block: 'nearest' })
      nextTab.focus()
    }
  }

  return (
    <div data-nextjs-call-stack-container>
      <div data-nextjs-call-stack-header>
        <p data-nextjs-call-stack-title>
          Call Stack <span data-nextjs-call-stack-count>{frames.length}</span>
        </p>
        {ignoredFramesTally > 0 && (
          <button
            // The isIgnoreListOpen value is used by tests to confirm whether it is open or not.
            data-nextjs-call-stack-ignored-list-toggle-button={isIgnoreListOpen}
            onClick={onToggleIgnoreList}
          >
            {`${isIgnoreListOpen ? 'Hide' : 'Show'} ${ignoredFramesTally} ignore-listed frame(s)`}
            <ChevronUpDownIcon />
          </button>
        )}
      </div>
      <div
        data-nextjs-call-stack-frames
        role="tablist"
        aria-orientation="vertical"
        onKeyDown={handleKeyDown}
        ref={containerRef}
      >
        {frames.map((frame, frameIndex) => {
          const hasCodeFrame = Boolean(frame.originalCodeFrame)
          return !frame.ignored || isIgnoreListOpen ? (
            <CallStackFrame
              key={frameIndex}
              frame={frame}
              index={frameIndex}
              isSelected={selectedFrameIndex === frameIndex}
              onSelect={hasCodeFrame ? onFrameSelect : undefined}
              tabGroupId={tabGroupId}
            />
          ) : null
        })}
      </div>
    </div>
  )
}

export const CALL_STACK_STYLES = css`
  [data-nextjs-call-stack-container] {
    position: relative;
    margin-top: 8px;
  }

  [data-nextjs-call-stack-header] {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--size-28);
    padding: 8px 8px 12px 4px;
    width: 100%;
  }

  [data-nextjs-call-stack-frames] {
    max-height: 15rem;
    overflow: auto;
  }

  [data-nextjs-call-stack-title] {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;

    margin: 0;

    color: var(--color-gray-1000);
    font-size: var(--size-16);
    font-weight: 500;
  }

  [data-nextjs-call-stack-count] {
    display: flex;
    justify-content: center;
    align-items: center;

    width: var(--size-20);
    height: var(--size-20);
    gap: 4px;

    color: var(--color-gray-1000);
    text-align: center;
    font-size: var(--size-11);
    font-weight: 500;
    line-height: var(--size-16);

    border-radius: var(--rounded-full);
    background: var(--color-gray-300);
  }

  [data-nextjs-call-stack-ignored-list-toggle-button] {
    all: unset;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-gray-900);
    font-size: var(--size-14);
    line-height: var(--size-20);
    border-radius: 6px;
    padding: 4px 6px;
    margin-right: -6px;
    transition: background 150ms ease;

    &:hover {
      background: var(--color-gray-100);
    }

    &:focus {
      outline: var(--focus-ring);
    }

    svg {
      width: var(--size-16);
      height: var(--size-16);
    }
  }
`
