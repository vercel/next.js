import type { OriginalStackFrame } from '../../../helpers/stack-frame'
import { useMemo, useState } from 'react'
import { CallStackFrame } from '../../call-stack-frame/call-stack-frame'
import { noop as css } from '../../../helpers/noop-template'

type CallStackProps = {
  frames: OriginalStackFrame[]
}

export function CallStack({ frames }: CallStackProps) {
  const [isIgnoreListOpen, setIsIgnoreListOpen] = useState(false)

  const { filteredFrames, ignoreListLength } = useMemo(() => {
    const filtered = []
    let ignoredLength = 0

    for (const frame of frames) {
      if (isIgnoreListOpen || !frame.ignored) {
        filtered.push(frame)
      }
      if (frame.ignored) {
        ignoredLength++
      }
    }

    return {
      filteredFrames: filtered,
      ignoreListLength: ignoredLength,
    }
  }, [frames, isIgnoreListOpen])

  return (
    <div className="error-overlay-call-stack-container">
      <div className="error-overlay-call-stack-header">
        <p className="error-overlay-call-stack-title">
          Call Stack{' '}
          <span className="error-overlay-call-stack-count">
            {frames.length}
          </span>
        </p>
        {ignoreListLength > 0 && (
          <button
            data-expand-ignore-button={isIgnoreListOpen}
            className="error-overlay-call-stack-ignored-list-toggle-button"
            onClick={() => setIsIgnoreListOpen(!isIgnoreListOpen)}
          >
            {`${isIgnoreListOpen ? 'Hide' : 'Show'} ${ignoreListLength} Ignore-listed Frames`}
            <ChevronUpDown />
          </button>
        )}
      </div>
      {filteredFrames.map((frame, frameIndex) => (
        <CallStackFrame
          key={`call-stack-leading-${frameIndex}`}
          frame={frame}
        />
      ))}
    </div>
  )
}

function ChevronUpDown() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.70722 2.39641C8.3167 2.00588 7.68353 2.00588 7.29301 2.39641L4.46978 5.21963L3.93945 5.74996L5.00011 6.81062L5.53044 6.28029L8.00011 3.81062L10.4698 6.28029L11.0001 6.81062L12.0608 5.74996L11.5304 5.21963L8.70722 2.39641ZM5.53044 9.71963L5.00011 9.1893L3.93945 10.25L4.46978 10.7803L7.29301 13.6035C7.68353 13.994 8.3167 13.994 8.70722 13.6035L11.5304 10.7803L12.0608 10.25L11.0001 9.1893L10.4698 9.71963L8.00011 12.1893L5.53044 9.71963Z"
        fill="currentColor"
      />
    </svg>
  )
}

export const CALL_STACK_STYLES = css`
  .error-overlay-call-stack-container {
    border-top: 1px solid var(--color-gray-400);
    padding: var(--size-4) var(--size-3);
  }

  .error-overlay-call-stack-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    margin-bottom: var(--size-3);

    padding: 0 var(--size-2);
  }

  .error-overlay-call-stack-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--size-2);

    margin: 0;

    color: var(--color-gray-1000);
    font-size: var(--size-font);
    font-weight: 500;
    line-height: var(--size-5);
  }

  .error-overlay-call-stack-count {
    display: flex;
    justify-content: center;
    align-items: center;

    width: var(--size-5);
    height: var(--size-5);
    padding: var(--size-0_5) var(--size-1_5);
    gap: var(--size-1);

    color: var(--color-gray-1000);
    text-align: center;
    font-size: var(--size-font-11);
    font-weight: 500;
    line-height: var(--size-4);

    border-radius: var(--rounded-full);
    background: var(--color-gray-300);
  }

  .error-overlay-call-stack-ignored-list-toggle-button {
    all: unset;
    color: var(--color-gray-900);
    font-size: var(--size-font-small);
    line-height: var(--size-5);

    &:focus {
      outline: none;
    }
  }
`
