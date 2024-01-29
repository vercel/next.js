import * as React from 'react'
import { CodeFrame } from '../../components/CodeFrame'
import type { ReadyRuntimeError } from '../../helpers/getErrorByType'
import { noop as css } from '../../helpers/noop-template'
import type { OriginalStackFrame } from '../../helpers/stack-frame'
import { groupStackFramesByFramework } from '../../helpers/group-stack-frames-by-framework'
import { CallStackFrame } from './CallStackFrame'
import { GroupedStackFrames } from './GroupedStackFrames'
import { ComponentStackFrameRow } from './ComponentStackFrameRow'

export type RuntimeErrorProps = { error: ReadyRuntimeError }

const RuntimeError: React.FC<RuntimeErrorProps> = function RuntimeError({
  error,
}) {
  const firstFirstPartyFrameIndex = React.useMemo<number>(() => {
    return error.frames.findIndex(
      (entry) =>
        entry.expanded &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )
  }, [error.frames])
  const firstFrame = React.useMemo<OriginalStackFrame | null>(() => {
    return error.frames[firstFirstPartyFrameIndex] ?? null
  }, [error.frames, firstFirstPartyFrameIndex])

  const allLeadingFrames = React.useMemo<OriginalStackFrame[]>(
    () =>
      firstFirstPartyFrameIndex < 0
        ? []
        : error.frames.slice(0, firstFirstPartyFrameIndex),
    [error.frames, firstFirstPartyFrameIndex]
  )

  const [all, setAll] = React.useState(firstFrame == null)
  const toggleAll = React.useCallback(() => {
    setAll((v) => !v)
  }, [])

  const leadingFrames = React.useMemo(
    () => allLeadingFrames.filter((f) => f.expanded || all),
    [all, allLeadingFrames]
  )
  const allCallStackFrames = React.useMemo<OriginalStackFrame[]>(
    () => error.frames.slice(firstFirstPartyFrameIndex + 1),
    [error.frames, firstFirstPartyFrameIndex]
  )
  const visibleCallStackFrames = React.useMemo<OriginalStackFrame[]>(
    () => allCallStackFrames.filter((f) => f.expanded || all),
    [all, allCallStackFrames]
  )

  const canShowMore = React.useMemo<boolean>(() => {
    return (
      allCallStackFrames.length !== visibleCallStackFrames.length ||
      (all && firstFrame != null)
    )
  }, [
    all,
    allCallStackFrames.length,
    firstFrame,
    visibleCallStackFrames.length,
  ])

  const stackFramesGroupedByFramework = React.useMemo(
    () => groupStackFramesByFramework(visibleCallStackFrames),
    [visibleCallStackFrames]
  )

  return (
    <React.Fragment>
      {firstFrame ? (
        <React.Fragment>
          <h2>Source</h2>
          {leadingFrames.map((frame, index) => (
            <CallStackFrame
              key={`leading-frame-${index}-${all}`}
              frame={frame}
            />
          ))}
          <CodeFrame
            stackFrame={firstFrame.originalStackFrame!}
            codeFrame={firstFrame.originalCodeFrame!}
          />
        </React.Fragment>
      ) : undefined}

      {error.componentStackFrames ? (
        <>
          <h2>Component Stack</h2>
          {error.componentStackFrames.map((componentStackFrame, index) => (
            <ComponentStackFrameRow
              key={index}
              componentStackFrame={componentStackFrame}
            />
          ))}
        </>
      ) : null}

      {stackFramesGroupedByFramework.length ? (
        <React.Fragment>
          <h2>Call Stack</h2>
          <GroupedStackFrames
            groupedStackFrames={stackFramesGroupedByFramework}
            all={all}
          />
        </React.Fragment>
      ) : undefined}
      {canShowMore ? (
        <React.Fragment>
          <button
            tabIndex={10}
            data-nextjs-data-runtime-error-collapsed-action
            type="button"
            onClick={toggleAll}
          >
            {all ? 'Hide' : 'Show'} collapsed frames
          </button>
        </React.Fragment>
      ) : undefined}
    </React.Fragment>
  )
}

export const styles = css`
  button[data-nextjs-data-runtime-error-collapsed-action] {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--size-font-small);
    line-height: var(--size-font-bigger);
    color: var(--color-accents-3);
  }

  [data-nextjs-call-stack-frame]:not(:last-child),
  [data-nextjs-component-stack-frame]:not(:last-child) {
    margin-bottom: var(--size-gap-double);
  }

  [data-nextjs-call-stack-frame] > h3,
  [data-nextjs-component-stack-frame] > h3 {
    margin-top: 0;
    margin-bottom: var(--size-gap);
    font-family: var(--font-stack-monospace);
    font-size: var(--size-font);
    color: #222;
  }
  [data-nextjs-call-stack-frame] > h3[data-nextjs-frame-expanded='false'] {
    color: #666;
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
    margin: var(--size-gap-double) 0;
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

export { RuntimeError }
