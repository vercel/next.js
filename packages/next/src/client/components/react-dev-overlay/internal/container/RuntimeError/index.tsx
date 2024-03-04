import * as React from 'react'
import { CodeFrame } from '../../components/CodeFrame'
import type { ReadyRuntimeError } from '../../helpers/getErrorByType'
import { noop as css } from '../../helpers/noop-template'
import { groupStackFramesByFramework } from '../../helpers/group-stack-frames-by-framework'
import { GroupedStackFrames } from './GroupedStackFrames'

export type RuntimeErrorProps = { error: ReadyRuntimeError }

export function RuntimeError({ error }: RuntimeErrorProps) {
  const { firstFrame, allLeadingFrames, allCallStackFrames } =
    React.useMemo(() => {
      const filteredFrames = error.frames.filter(
        (f) =>
          !(
            f.sourceStackFrame.file === '<anonymous>' &&
            ['stringify', '<unknown>'].includes(f.sourceStackFrame.methodName)
          ) && !f.sourceStackFrame.file?.startsWith('node:internal')
      )

      const firstFirstPartyFrameIndex = filteredFrames.findIndex(
        (entry) =>
          entry.expanded &&
          Boolean(entry.originalCodeFrame) &&
          Boolean(entry.originalStackFrame)
      )

      return {
        firstFrame: filteredFrames[firstFirstPartyFrameIndex] ?? null,
        allLeadingFrames:
          firstFirstPartyFrameIndex < 0
            ? []
            : filteredFrames.slice(0, firstFirstPartyFrameIndex),
        allCallStackFrames: filteredFrames.slice(firstFirstPartyFrameIndex + 1),
      }
    }, [error.frames])

  const [all, setAll] = React.useState(firstFrame == null)

  const {
    canShowMore,
    leadingFramesGroupedByFramework,
    stackFramesGroupedByFramework,
  } = React.useMemo(() => {
    const leadingFrames = allLeadingFrames.filter((f) => f.expanded || all)
    const visibleCallStackFrames = allCallStackFrames.filter(
      (f) => f.expanded || all
    )

    return {
      canShowMore:
        allCallStackFrames.length !== visibleCallStackFrames.length ||
        (all && firstFrame != null),

      stackFramesGroupedByFramework:
        groupStackFramesByFramework(allCallStackFrames),

      leadingFramesGroupedByFramework:
        groupStackFramesByFramework(leadingFrames),
    }
  }, [all, allCallStackFrames, allLeadingFrames, firstFrame])

  return (
    <React.Fragment>
      {firstFrame ? (
        <React.Fragment>
          <h2>Source</h2>
          <GroupedStackFrames
            groupedStackFrames={leadingFramesGroupedByFramework}
            show={all}
          />
          <CodeFrame
            stackFrame={firstFrame.originalStackFrame!}
            codeFrame={firstFrame.originalCodeFrame!}
          />
        </React.Fragment>
      ) : undefined}

      {stackFramesGroupedByFramework.length ? (
        <React.Fragment>
          <h2>Call Stack</h2>
          <GroupedStackFrames
            groupedStackFrames={stackFramesGroupedByFramework}
            show={all}
          />
        </React.Fragment>
      ) : undefined}
      {canShowMore ? (
        <React.Fragment>
          <button
            tabIndex={10}
            data-nextjs-data-runtime-error-collapsed-action
            type="button"
            onClick={() => setAll(!all)}
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

  [data-nextjs-container-errors-pseudo-html] {
    position: relative;
  }
  [data-nextjs-container-errors-pseudo-html-collapse] {
    position: absolute;
    left: 10px;
    top: 10px;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
  }
  [data-nextjs-container-errors-pseudo-html--diff-add] {
    color: var(--color-ansi-green);
  }
  [data-nextjs-container-errors-pseudo-html--diff-remove] {
    color: var(--color-ansi-red);
  }
  [data-nextjs-container-errors-pseudo-html--tag-error] {
    color: var(--color-ansi-red);
    font-weight: bold;
  }
`
