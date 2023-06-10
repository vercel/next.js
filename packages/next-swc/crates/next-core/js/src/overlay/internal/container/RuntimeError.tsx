import * as React from 'react'
import { StackFrame } from '@vercel/turbopack-next/compiled/stacktrace-parser'

import { CodeFrame } from '../components/CodeFrame'
import { DialogBody, DialogBodyProps } from '../components/Dialog'
import { LeftRightDialogHeader } from '../components/LeftRightDialogHeader'
import { clsx } from '../helpers/clsx'
import { getErrorSource } from '../helpers/nodeStackFrames'
import { noop as css } from '../helpers/noop-template'
import { ReadyRuntimeError } from '../helpers/getErrorByType'
import { decodeMagicIdentifiers } from '../helpers/magic-identifier'
import { getFrameSource, OriginalStackFrame } from '../helpers/stack-frame'
import { usePagination } from '../hooks/usePagination'
import { ExternalLink } from '../icons'

function CallStackFrame({ frame }: { frame: OriginalStackFrame }) {
  // TODO: ability to expand resolved frames
  // TODO: render error or external indicator

  const f: StackFrame = frame.originalStackFrame ?? frame.sourceStackFrame
  const hasSource = Boolean(frame.originalCodeFrame)

  const open = React.useCallback(() => {
    if (!hasSource) return

    const params = new URLSearchParams()
    for (const key in f) {
      params.append(key, ((f as any)[key] ?? '').toString())
    }

    self
      .fetch(
        `${
          process.env.__NEXT_ROUTER_BASEPATH ?? ''
        }/__nextjs_launch-editor?${params.toString()}`
      )
      .then(
        () => {},
        () => {
          console.error('There was an issue opening this code in your editor.')
        }
      )
  }, [hasSource, f])

  return (
    <li className="call-stack-frame" data-expanded={Boolean(frame.expanded)}>
      <h6>{f.methodName}</h6>
      <div
        data-has-source={hasSource ? 'true' : undefined}
        tabIndex={hasSource ? 10 : undefined}
        role={hasSource ? 'link' : undefined}
        onClick={open}
        title={hasSource ? 'Click to open in your editor' : undefined}
      >
        <span>{getFrameSource(f)}</span>
        <ExternalLink />
      </div>
    </li>
  )
}

export type RuntimeErrorProps = { error: ReadyRuntimeError }

export function RuntimeError({ error }: RuntimeErrorProps) {
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

  return (
    <>
      {firstFrame ? (
        <>
          <h5>Source</h5>
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
      {visibleCallStackFrames.length ? (
        <>
          <h5>Call Stack</h5>
          <ul className="call-stack-frames">
            {visibleCallStackFrames.map((frame, index) => (
              <CallStackFrame
                key={`call-stack-${index}-${all}`}
                frame={frame}
              />
            ))}
          </ul>
        </>
      ) : undefined}
      {canShowMore ? (
        <>
          <button
            tabIndex={10}
            type="button"
            onClick={toggleAll}
            className="runtime-error-collapsed-action"
          >
            {all ? 'Hide' : 'Show'} collapsed frames
          </button>
        </>
      ) : undefined}
    </>
  )
}

function HotlinkedText(props: { text: string }) {
  const { text } = props

  const linkRegex = /https?:\/\/[^\s/$.?#].[^\s)'"]*/i
  return (
    <>
      {linkRegex.test(text)
        ? text.split(' ').map((word, index, array) => {
            if (linkRegex.test(word)) {
              const link = linkRegex.exec(word)
              return (
                <React.Fragment key={`link-${index}`}>
                  {link && (
                    <a href={link[0]} target="_blank" rel="noreferrer noopener">
                      {word}
                    </a>
                  )}
                  {index === array.length - 1 ? '' : ' '}
                </React.Fragment>
              )
            }
            return index === array.length - 1 ? (
              <React.Fragment key={`text-${index}`}>{word}</React.Fragment>
            ) : (
              <React.Fragment key={`text-${index}`}>{word} </React.Fragment>
            )
          })
        : text}
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
      <h2
        data-nextjs-dialog-header
        id="nextjs__container_errors_desc"
        data-severity="error"
      >
        {activeError.error.name}:{' '}
        <HotlinkedText
          text={decodeMagicIdentifiers(activeError.error.message)}
        />
      </h2>
      {isServerError ? (
        <div>
          <small>
            This error happened while generating the page. Any console logs will
            be displayed in the terminal window.
          </small>
        </div>
      ) : undefined}
      <RuntimeError key={activeError.id.toString()} error={activeError} />
    </DialogBody>
  )
}

export const styles = css`
  button.runtime-error-collapsed-action {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--size-font-small);
    line-height: var(--size-font-bigger);
    color: var(--color-text-dim);
  }

  .call-stack-frames {
    list-style: none;
    padding-left: calc(var(--size-gap) + var(--size-gap-half));
    overflow-y: scroll;
  }

  .call-stack-frame:not(:last-child) {
    margin-bottom: var(--size-gap-double);
  }

  .call-stack-frame > h6 {
    margin-top: 0;
    margin-bottom: 0;
    font-family: var(--font-mono);
    color: #666;
  }

  .call-stack-frame[data-expanded='true'] > h6 {
    color: #222;
  }

  .call-stack-frame > div {
    display: flex;
    align-items: center;
    padding-left: calc(var(--size-gap) + var(--size-gap-half));
    font-size: var(--size-font-small);
    color: #999;
  }

  .call-stack-frame > div > svg {
    width: auto;
    height: var(--size-font-small);
    margin-left: var(--size-gap);

    display: none;
  }

  .call-stack-frame > div[data-has-source] {
    cursor: pointer;
  }

  .call-stack-frame > div[data-has-source]:hover {
    text-decoration: underline dotted;
  }

  .call-stack-frame > div[data-has-source] > svg {
    display: unset;
  }
`
