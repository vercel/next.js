import * as React from 'react'
import { CodeFrame } from '../../components/CodeFrame'
import {
  useFrames,
  type ReadyRuntimeError,
} from '../../helpers/get-error-by-type'
import { noop as css } from '../../helpers/noop-template'
import { CallStackFrame } from './CallStackFrame'

export type RuntimeErrorProps = { error: ReadyRuntimeError }

export function RuntimeError({ error }: RuntimeErrorProps) {
  const [isIgnoredExpanded, setIsIgnoredExpanded] = React.useState(false)

  const frames = useFrames(error)
  const {
    firstFrame,
    allLeadingFrames,
    trailingCallStackFrames,
    displayedFramesCount,
  } = React.useMemo(() => {
    const filteredFrames = frames.filter((frame) =>
      isIgnoredExpanded ? true : !frame.ignored
    )

    const firstFirstPartyFrameIndex = filteredFrames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    return {
      displayedFramesCount: filteredFrames.length,
      firstFrame: filteredFrames[firstFirstPartyFrameIndex] ?? null,
      allLeadingFrames:
        firstFirstPartyFrameIndex < 0
          ? []
          : filteredFrames.slice(0, firstFirstPartyFrameIndex),
      trailingCallStackFrames: filteredFrames.slice(
        firstFirstPartyFrameIndex < 0 ? 0 : firstFirstPartyFrameIndex
      ),
    }
  }, [frames, isIgnoredExpanded])

  return (
    <>
      {firstFrame ? (
        <>
          <h2>Source</h2>
          {allLeadingFrames.map((frame, frameIndex) => (
            <CallStackFrame
              key={`call-stack-leading-${frameIndex}`}
              frame={frame}
            />
          ))}
          <CodeFrame
            stackFrame={firstFrame.originalStackFrame!}
            codeFrame={firstFrame.originalCodeFrame!}
          />
        </>
      ) : undefined}

      {trailingCallStackFrames.map((frame, frameIndex) => (
        <CallStackFrame
          key={`call-stack-leading-${frameIndex}`}
          frame={frame}
        />
      ))}
      {
        // if the default displayed ignored frames count is equal equal to the total frames count, hide the button
        displayedFramesCount === frames.length && !isIgnoredExpanded ? null : (
          <button
            data-expand-ignore-button={isIgnoredExpanded}
            onClick={() => setIsIgnoredExpanded(!isIgnoredExpanded)}
          >
            {`${isIgnoredExpanded ? 'Hide' : 'Show'} ignored frames`}
          </button>
        )
      }
    </>
  )
}

export const styles = css`
  [data-nextjs-call-stack-frame]:not(:last-child),
  [data-nextjs-component-stack-frame]:not(:last-child) {
    margin-bottom: var(--size-gap-double);
  }

  [data-expand-ignore-button]:focus:not(:focus-visible),
  [data-expand-ignore-button] {
    background: none;
    border: none;
    color: var(--color-font);
    cursor: pointer;
    font-size: var(--size-font);
    margin: var(--size-gap) 0;
    padding: 0;
    text-decoration: underline;
    outline: none;
  }

  [data-nextjs-data-runtime-error-copy-button],
  [data-nextjs-data-runtime-error-copy-button]:focus:not(:focus-visible) {
    position: relative;
    margin-left: var(--size-gap);
    padding: 0;
    border: none;
    background: none;
    outline: none;
  }
  [data-nextjs-data-runtime-error-copy-button] > svg {
    vertical-align: middle;
  }
  .nextjs-data-runtime-error-copy-button {
    color: inherit;
  }
  .nextjs-data-runtime-error-copy-button--initial:hover {
    cursor: pointer;
  }
  .nextjs-data-runtime-error-copy-button[aria-disabled='true'] {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .nextjs-data-runtime-error-copy-button--error,
  .nextjs-data-runtime-error-copy-button--error:hover {
    color: var(--color-ansi-red);
  }
  .nextjs-data-runtime-error-copy-button--success {
    color: var(--color-ansi-green);
  }

  [data-nextjs-call-stack-frame] > h3,
  [data-nextjs-component-stack-frame] > h3 {
    margin-top: 0;
    margin-bottom: 0;
    font-family: var(--font-stack-monospace);
    font-size: var(--size-font);
  }
  [data-nextjs-call-stack-frame] > h3[data-nextjs-frame-expanded='false'] {
    color: #666;
    display: inline-block;
  }
  [data-nextjs-call-stack-frame] > div,
  [data-nextjs-component-stack-frame] > div {
    display: flex;
    align-items: center;
    padding-left: calc(var(--size-gap) + var(--size-gap-half));
    font-size: var(--size-font-small);
    color: #999;
  }
  [data-nextjs-call-stack-frame] > div > svg,
  [data-nextjs-component-stack-frame] > [role='link'] > svg {
    width: auto;
    height: var(--size-font-small);
    margin-left: var(--size-gap);
    flex-shrink: 0;
    display: none;
  }

  [data-nextjs-call-stack-frame] > div[data-has-source],
  [data-nextjs-component-stack-frame] > [role='link'] {
    cursor: pointer;
  }
  [data-nextjs-call-stack-frame] > div[data-has-source]:hover,
  [data-nextjs-component-stack-frame] > [role='link']:hover {
    text-decoration: underline dotted;
  }
  [data-nextjs-call-stack-frame] > div[data-has-source] > svg,
  [data-nextjs-component-stack-frame] > [role='link'] > svg {
    display: unset;
  }

  [data-nextjs-call-stack-framework-icon] {
    margin-right: var(--size-gap);
  }
  [data-nextjs-call-stack-framework-icon='next'] > mask {
    mask-type: alpha;
  }
  [data-nextjs-call-stack-framework-icon='react'] {
    color: rgb(20, 158, 202);
  }
  [data-nextjs-collapsed-call-stack-details][open]
    [data-nextjs-call-stack-chevron-icon] {
    transform: rotate(90deg);
  }
  [data-nextjs-collapsed-call-stack-details] summary {
    display: flex;
    align-items: center;
    margin-bottom: var(--size-gap);
    list-style: none;
  }
  [data-nextjs-collapsed-call-stack-details] summary::-webkit-details-marker {
    display: none;
  }

  [data-nextjs-collapsed-call-stack-details] h3 {
    color: #666;
  }
  [data-nextjs-collapsed-call-stack-details] [data-nextjs-call-stack-frame] {
    margin-bottom: var(--size-gap-double);
  }
`
