import type { OriginalStackFrame } from '../../../shared/stack-frame'

import { CallStackFrame } from '../call-stack-frame/call-stack-frame'
import { ChevronUpDownIcon } from '../../icons/chevron-up-down'
import { css } from '../../utils/css'

export function CallStack({
  frames,
  isIgnoreListOpen,
  ignoredFramesTally,
  onToggleIgnoreList,
}: {
  frames: readonly OriginalStackFrame[]
  isIgnoreListOpen: boolean
  ignoredFramesTally: number
  onToggleIgnoreList: () => void
}) {
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
      {frames.map((frame, frameIndex) => {
        return !frame.ignored || isIgnoreListOpen ? (
          <CallStackFrame key={frameIndex} frame={frame} />
        ) : null
      })}
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
