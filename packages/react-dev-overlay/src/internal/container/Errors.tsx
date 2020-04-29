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
      return `${event.reason.name}::${event.reason.message}`
    }
    default: {
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _: never = event
  return ''
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
        frames: await getOriginalStackFrames(event.frames),
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
    getErrorByType(nextError).then(
      resolved => {
        // We don't care if the desired error changed while we were resolving,
        // thus we're not tracking it using a ref. Once the work has been done,
        // we'll store it.
        setLookups(m => ({ ...m, [resolved.id]: resolved }))
      },
      () => {
        // TODO: handle this, though an edge case
      }
    )
  }, [nextError])

  const [isMinimized, setMinimized] = React.useState<boolean>(false)
  const [activeIdx, setActiveIndex] = React.useState<number>(0)
  const previous = React.useCallback((e?: MouseEvent | TouchEvent) => {
    e?.preventDefault()
    setActiveIndex(v => Math.max(0, v - 1))
  }, [])
  const next = React.useCallback(
    (e?: MouseEvent | TouchEvent) => {
      e?.preventDefault()
      setActiveIndex(v => Math.max(0, Math.min(readyErrors.length - 1, v + 1)))
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

  // This component shouldn't be rendered with no errors, but if it is, let's
  // handle it gracefully by rendering nothing.
  if (errors.length < 1) {
    return null
  }

  if (isLoading) {
    // TODO: better loading state
    return <Overlay />
  }

  if (isMinimized) {
    // TODO: render minimized state in bottom left
    return null
  }

  // TODO: render overlay
  return (
    <Overlay>
      <Dialog
        type="error"
        aria-labelledby="nextjs__container_errors_label"
        aria-describedby="nextjs__container_errors_desc"
        onClose={minimize}
      >
        <DialogContent>
          <DialogHeader className="nextjs-container-errors-header">
            <LeftRightDialogHeader
              previous={activeIdx > 0 ? previous : null}
              next={activeIdx < readyErrors.length - 1 ? next : null}
              close={minimize}
            >
              <small style={{ color: '#757575', marginLeft: 9 }}>
                {activeIdx + 1} of {readyErrors.length} unhandled error
                {readyErrors.length < 2 ? '' : 's'}
              </small>
            </LeftRightDialogHeader>
            <h4 id="nextjs__container_errors_label">Unhandled Runtime Error</h4>
            <p id="nextjs__container_errors_desc">
              {activeError.error.name}: {activeError.error.message}
            </p>
          </DialogHeader>
          <DialogBody className="nextjs-container-errors-body">
            <RuntimeError error={activeError} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Overlay>
  )
}

export const styles = css`
  .nextjs-container-errors-header > h4 {
    line-height: 1.5;
    margin: 0;
    margin-top: 0.125rem;
  }
  .nextjs-container-errors-header > p {
    font-family: var(--font-stack-monospace);
    margin: 0;
    color: #6a6a6a;
  }

  .nextjs-container-errors-body {
    margin-top: 1.5rem;
  }
`
