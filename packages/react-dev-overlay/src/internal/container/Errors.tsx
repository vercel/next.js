import * as React from 'react'
import {
  TYPE_UNHANDLED_ERROR,
  TYPE_UNHANDLED_REJECTION,
  UnhandledError,
  UnhandledRejection,
} from '../bus'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from '../components/Dialog'
import { LeftRightDialogHeader } from '../components/LeftRightDialogHeader'
import { Overlay } from '../components/Overlay'
import { Toast } from '../components/Toast'
import { isNodeError } from '../helpers/nodeStackFrames'
import { noop as css } from '../helpers/noop-template'
import {
  getOriginalStackFrames,
  OriginalStackFrame,
} from '../helpers/stack-frame'
import { RuntimeError } from './RuntimeError'

export type SupportedErrorEvent = {
  id: number
  event: UnhandledError | UnhandledRejection
}
export type ErrorsProps = { errors: SupportedErrorEvent[] }

export type ReadyRuntimeError = {
  id: number

  runtime: true
  error: Error
  frames: OriginalStackFrame[]
}
type ReadyErrorEvent = ReadyRuntimeError

function getErrorSignature(ev: SupportedErrorEvent): string {
  const { event } = ev
  switch (event.type) {
    case TYPE_UNHANDLED_ERROR:
    case TYPE_UNHANDLED_REJECTION: {
      return `${event.reason.name}::${event.reason.message}::${event.reason.stack}`
    }
    default: {
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _: never = event
  return ''
}

const HotlinkedText: React.FC<{
  text: string
}> = function HotlinkedText(props) {
  const { text } = props

  const linkRegex = /https?:\/\/[^\s/$.?#].[^\s"]*/i
  return (
    <>
      {linkRegex.test(text)
        ? text.split(' ').map((word, index, array) => {
            if (linkRegex.test(word)) {
              return (
                <React.Fragment key={`link-${index}`}>
                  <a href={word}>{word}</a>
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

async function getErrorByType(
  ev: SupportedErrorEvent
): Promise<ReadyErrorEvent> {
  const { id, event } = ev
  switch (event.type) {
    case TYPE_UNHANDLED_ERROR:
    case TYPE_UNHANDLED_REJECTION: {
      return {
        id,
        runtime: true,
        error: event.reason,
        frames: await getOriginalStackFrames(
          isNodeError(event.reason),
          event.frames
        ),
      }
    }
    default: {
      break
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _: never = event
  throw new Error('type system invariant violation')
}

export const Errors: React.FC<ErrorsProps> = function Errors({ errors }) {
  const [lookups, setLookups] = React.useState(
    {} as { [eventId: string]: ReadyErrorEvent }
  )

  const [readyErrors, nextError] = React.useMemo<
    [ReadyErrorEvent[], SupportedErrorEvent | null]
  >(() => {
    let ready: ReadyErrorEvent[] = []
    let next: SupportedErrorEvent | null = null

    // Ensure errors are displayed in the order they occurred in:
    for (let idx = 0; idx < errors.length; ++idx) {
      const e = errors[idx]
      const { id } = e
      if (id in lookups) {
        ready.push(lookups[id])
        continue
      }

      // Check for duplicate errors
      if (idx > 0) {
        const prev = errors[idx - 1]
        if (getErrorSignature(prev) === getErrorSignature(e)) {
          continue
        }
      }

      next = e
      break
    }

    return [ready, next]
  }, [errors, lookups])

  const isLoading = React.useMemo<boolean>(() => {
    return readyErrors.length < 1 && Boolean(errors.length)
  }, [errors.length, readyErrors.length])

  React.useEffect(() => {
    if (nextError == null) {
      return
    }
    let mounted = true

    getErrorByType(nextError).then(
      (resolved) => {
        // We don't care if the desired error changed while we were resolving,
        // thus we're not tracking it using a ref. Once the work has been done,
        // we'll store it.
        if (mounted) {
          setLookups((m) => ({ ...m, [resolved.id]: resolved }))
        }
      },
      () => {
        // TODO: handle this, though an edge case
      }
    )

    return () => {
      mounted = false
    }
  }, [nextError])

  const [isMinimized, setMinimized] = React.useState<boolean>(false)
  const [activeIdx, setActiveIndex] = React.useState<number>(0)
  const previous = React.useCallback((e?: MouseEvent | TouchEvent) => {
    e?.preventDefault()
    setActiveIndex((v) => Math.max(0, v - 1))
  }, [])
  const next = React.useCallback(
    (e?: MouseEvent | TouchEvent) => {
      e?.preventDefault()
      setActiveIndex((v) =>
        Math.max(0, Math.min(readyErrors.length - 1, v + 1))
      )
    },
    [readyErrors.length]
  )

  const activeError = React.useMemo<ReadyErrorEvent | null>(
    () => readyErrors[activeIdx] ?? null,
    [activeIdx, readyErrors]
  )

  // Reset component state when there are no errors to be displayed.
  // This should never happen, but lets handle it.
  React.useEffect(() => {
    if (errors.length < 1) {
      setLookups({})
      setMinimized(false)
      setActiveIndex(0)
    }
  }, [errors.length])

  const minimize = React.useCallback((e?: MouseEvent | TouchEvent) => {
    e?.preventDefault()
    setMinimized(true)
  }, [])
  const reopen = React.useCallback(
    (e?: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      e?.preventDefault()
      setMinimized(false)
    },
    []
  )

  // This component shouldn't be rendered with no errors, but if it is, let's
  // handle it gracefully by rendering nothing.
  if (errors.length < 1 || activeError == null) {
    return null
  }

  if (isLoading) {
    // TODO: better loading state
    return <Overlay />
  }

  if (isMinimized) {
    return (
      <Toast className="nextjs-toast-errors-parent" onClick={reopen}>
        <div className="nextjs-toast-errors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>
            {readyErrors.length} error{readyErrors.length > 1 ? 's' : ''}
          </span>
        </div>
      </Toast>
    )
  }

  const isServerError = isNodeError(activeError.error)
  return (
    <Overlay>
      <Dialog
        type="error"
        aria-labelledby="nextjs__container_errors_label"
        aria-describedby="nextjs__container_errors_desc"
        onClose={isServerError ? undefined : minimize}
      >
        <DialogContent>
          <DialogHeader className="nextjs-container-errors-header">
            <LeftRightDialogHeader
              previous={activeIdx > 0 ? previous : null}
              next={activeIdx < readyErrors.length - 1 ? next : null}
              close={isServerError ? undefined : minimize}
            >
              <small>
                <span>{activeIdx + 1}</span> of{' '}
                <span>{readyErrors.length}</span> unhandled error
                {readyErrors.length < 2 ? '' : 's'}
              </small>
            </LeftRightDialogHeader>
            <h1 id="nextjs__container_errors_label">
              {isServerError ? 'Server Error' : 'Unhandled Runtime Error'}
            </h1>
            <p id="nextjs__container_errors_desc">
              {activeError.error.name}:{' '}
              <HotlinkedText text={activeError.error.message} />
            </p>
            {isServerError ? (
              <div>
                <small>
                  This error happened while generating the page. Any console
                  logs will be displayed in the terminal window.
                </small>
              </div>
            ) : undefined}
          </DialogHeader>
          <DialogBody className="nextjs-container-errors-body">
            <RuntimeError key={activeError.id.toString()} error={activeError} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Overlay>
  )
}

export const styles = css`
  .nextjs-container-errors-header > h1 {
    font-size: var(--size-font-big);
    line-height: var(--size-font-bigger);
    font-weight: bold;
    margin: 0;
    margin-top: calc(var(--size-gap-double) + var(--size-gap-half));
  }
  .nextjs-container-errors-header small {
    font-size: var(--size-font-small);
    color: var(--color-accents-1);
    margin-left: var(--size-gap-double);
  }
  .nextjs-container-errors-header small > span {
    font-family: var(--font-stack-monospace);
  }
  .nextjs-container-errors-header > p {
    font-family: var(--font-stack-monospace);
    font-size: var(--size-font-small);
    line-height: var(--size-font-big);
    font-weight: bold;
    margin: 0;
    margin-top: var(--size-gap-half);
    color: var(--color-ansi-red);
    white-space: pre-wrap;
  }
  .nextjs-container-errors-header > div > small {
    margin: 0;
    margin-top: var(--size-gap-half);
  }
  .nextjs-container-errors-header > p > a {
    color: var(--color-ansi-red);
  }

  .nextjs-container-errors-body > h5:not(:first-child) {
    margin-top: calc(var(--size-gap-double) + var(--size-gap));
  }
  .nextjs-container-errors-body > h5 {
    margin-bottom: var(--size-gap);
  }

  .nextjs-toast-errors-parent {
    cursor: pointer;
    transition: transform 0.2s ease;
  }
  .nextjs-toast-errors-parent:hover {
    transform: scale(1.1);
  }
  .nextjs-toast-errors {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .nextjs-toast-errors > svg {
    margin-right: var(--size-gap);
  }
`
