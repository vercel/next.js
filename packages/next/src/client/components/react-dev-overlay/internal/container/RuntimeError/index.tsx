import * as React from 'react'
import type { ReactNode } from 'react'

import { CodeFrame } from '../../components/CodeFrame'
import {
  DialogBody,
  type DialogBodyProps,
} from '../../components/Dialog/DialogBody'
import { HotlinkedText } from '../../components/hot-linked-text'
import { LeftRightDialogHeader } from '../../components/LeftRightDialogHeader'

import type { ReadyRuntimeError } from '../../helpers/getErrorByType'
import { noop as css } from '../../helpers/noop-template'
import type { OriginalStackFrame } from '../../helpers/stack-frame'
import { groupStackFramesByFramework } from '../../helpers/group-stack-frames-by-framework'
import { getErrorSource } from '../../helpers/nodeStackFrames'
import { clsx } from '../../helpers/clsx'

import { usePagination } from '../../hooks/use-pagination'

import { CallStackFrame } from './CallStackFrame'
import { GroupedStackFrames } from './GroupedStackFrames'
import { ComponentStackFrameRow } from './ComponentStackFrameRow'

export type RuntimeErrorProps = { error: ReadyRuntimeError }

export function RuntimeError({ error }: RuntimeErrorProps): ReactNode {
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
  const toggleAll = () => {
    setAll((v) => !v)
  }

  const leadingFrames = React.useMemo(
    () => (all ? allLeadingFrames : allLeadingFrames.filter((f) => f.expanded)),
    [all, allLeadingFrames]
  )
  const allCallStackFrames = React.useMemo<OriginalStackFrame[]>(
    () => error.frames.slice(firstFirstPartyFrameIndex + 1),
    [error.frames, firstFirstPartyFrameIndex]
  )
  const visibleCallStackFrames = React.useMemo<OriginalStackFrame[]>(
    () =>
      all ? allCallStackFrames : allCallStackFrames.filter((f) => f.expanded),
    [all, allCallStackFrames]
  )

  const canShowMore =
    allCallStackFrames.length !== visibleCallStackFrames.length ||
    (all && firstFrame != null)

  const stackFramesGroupedByFramework = React.useMemo(
    () => groupStackFramesByFramework(visibleCallStackFrames),
    [visibleCallStackFrames]
  )

  return (
    <>
      {firstFrame ? (
        <>
          <h2>Source</h2>
          <ul className="call-stack-frames">
            {leadingFrames.map((frame, index) => (
              <CallStackFrame
                key={`leading-frame-${index}-${all}`}
                frame={frame}
              />
            ))}
          </ul>
          <CodeFrame
            stackFrame={firstFrame.originalStackFrame!}
            codeFrame={firstFrame.originalCodeFrame!}
          />
        </>
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

      <h2 className="with-loader">
        Call Stack
        {error.complete ? null : (
          <div className="loader">
            <div className="loading"></div>
            Applying source map
          </div>
        )}
      </h2>
      <GroupedStackFrames
        groupedStackFrames={stackFramesGroupedByFramework}
        all={all}
      />

      {canShowMore ? (
        <>
          <button
            data-nextjs-data-runtime-error-collapsed-action
            type="button"
            onClick={toggleAll}
            className="collapse"
          >
            {all ? 'Hide' : 'Show'} collapsed frames
          </button>
        </>
      ) : undefined}
    </>
  )
}

type RuntimeErrorsDialogBodyProps = {
  items: ReadyRuntimeError[]
  message: string
  'data-hidden'?: boolean
}

export function RuntimeErrorsDialogBody({
  items: readyErrors,
  message,
  'data-hidden': hidden = false,
  className,
  ...rest
}: RuntimeErrorsDialogBodyProps & Omit<DialogBodyProps, 'children'>) {
  const [activeError, { previous, next }, activeIdx] =
    usePagination(readyErrors)

  if (readyErrors.length < 1 || activeError == null) {
    return (
      <DialogBody
        {...rest}
        data-hidden={hidden}
        className={clsx('runtime-errors', className)}
      />
    )
  }

  const isServerError = ['server', 'edge-server'].includes(
    getErrorSource(activeError.error) || ''
  )

  return (
    <DialogBody
      {...rest}
      data-hidden={hidden}
      className={clsx('runtime-errors', className)}
    >
      <div className="title-pagination">
        <h1 id="nextjs__container_errors_label">{message}</h1>
        <LeftRightDialogHeader
          hidden={hidden}
          previous={activeIdx > 0 ? previous : null}
          next={activeIdx < readyErrors.length - 1 ? next : null}
          severity="error"
        >
          <small>
            <span>{activeIdx + 1}</span> of <span>{readyErrors.length}</span>
          </small>
        </LeftRightDialogHeader>
      </div>

      <p id="nextjs__container_errors_desc" data-severity="error">
        {activeError.error.name}:{' '}
        <HotlinkedText text={activeError.error.message} />
      </p>

      {isServerError ? (
        <div>
          <small>
            This error happened while generating the page. Any console logs will
            be displayed in the terminal window.
          </small>
        </div>
      ) : undefined}

      {/* invalidate the component with a key */}
      <RuntimeError
        key={
          activeError.id.toString() +
          (activeError.complete ? '' : '-incomplete')
        }
        error={activeError}
      />
    </DialogBody>
  )
}

export const styles = css`
  .runtime-errors {
    overflow-y: auto;
  }

  .runtime-errors > button.collapse {
    background: var(--color-bg);
    border: none;
    padding: 0;
    font-size: var(--size-font-small);
    line-height: var(--size-font-bigger);
    color: var(--color-text-dim);

    padding: var(--size-gap-double);

    position: sticky;

    margin-bottom: calc(var(--size-gap-double) * -1);
    bottom: calc(var(--size-gap-double) * -1);
  }

  .call-stack-frames {
    list-style: none;
    padding-left: calc(var(--size-gap));
    margin-bottom: 0;
  }

  .call-stack-frame:not(:last-child),
  .component-stack-frame:not(:last-child) {
    margin-bottom: var(--size-gap-double);
  }

  .call-stack-frame > h3,
  .component-stack-frame > h3 {
    margin-top: 0;
    margin-bottom: 0;
    /* margin-bottom: var(--size-gap); */
    font-family: var(--font-mono);
    font-size: var(--size-font);
    color: var(--color-stack-h3);
  }

  .call-stack-frame[data-expanded='false'] > h3 {
    color: var(--color-stack-headline);
  }

  .call-stack-frame > div,
  .component-stack-frame > div {
    display: flex;
    align-items: center;
    padding-left: calc(var(--size-gap) + var(--size-gap-half));
    font-size: var(--size-font-small);
    color: var(--color-stack-subline);
  }

  .call-stack-frame > div > svg,
  .component-stack-frame > div > svg {
    width: auto;
    height: var(--size-font-small);
    margin-left: var(--size-gap);

    display: none;
  }

  .call-stack-frame > div[data-has-source],
  .component-stack-frame > div {
    cursor: pointer;
  }

  .call-stack-frame > div[data-has-source]:hover,
  .component-stack-frame > div:hover {
    text-decoration: underline dotted;
  }

  .call-stack-frame > div[data-has-source] > svg,
  .component-stack-frame > div > svg {
    display: unset;
  }

  .collapsed-call-stack-details [data-framework-icon] {
    margin-right: var(--size-gap);
  }

  .collapsed-call-stack-details [data-framework-icon='nextjs'] > mask {
    mask-type: alpha;
  }

  .collapsed-call-stack-details [data-framework-icon='react'] {
    color: rgb(20, 158, 202);
  }

  .collapsed-call-stack-details .icon.chevron {
    will-change: transform;
    transform: rotate(0deg);
    transition: 100ms ease-in-out;
  }

  .collapsed-call-stack-details[open] .icon.chevron {
    transform: rotate(90deg);
  }

  .collapsed-call-stack-details summary {
    display: flex;
    align-items: center;
    margin: var(--size-gap-double) 0;
    list-style: none;

    /* account for chevron padding*/
    margin-left: -4px;
  }

  .collapsed-call-stack-details summary::-webkit-details-marker {
    display: none;
  }

  .collapsed-call-stack-details h3 {
    color: var(--color-stack-headline);
  }

  .collapsed-call-stack-details .call-stack-frame {
    margin-bottom: var(--size-gap-double);
  }

  .with-loader {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .loader {
    display: flex;
    align-items: center;

    margin-top: var(--size-gap-double);
    padding: var(--size-gap);
  }

  .with-loader > .loader {
    font-size: var(--size-font);
    font-weight: normal;
  }

  .loading {
    color: transparent !important;
    min-height: var(--size-icon);
    min-width: var(--size-icon);
    pointer-events: none;
    margin-right: var(--size-gap-double);
  }

  .loading::after {
    animation: loading 500ms infinite linear;
    background: transparent;

    border: var(--size-border) solid var(--color-text-dim);
    border-radius: 50%;
    border-right-color: transparent;
    border-top-color: transparent;

    content: '';
    display: block;
    opacity: 1;
    padding: 0;
    z-index: 1;
    height: var(--size-icon);
    width: var(--size-icon);
  }

  @keyframes loading {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`
