import * as React from 'react'
import {
  TYPE_UNHANDLED_ERROR,
  TYPE_UNHANDLED_REJECTION,
  UnhandledError,
  UnhandledRejection,
} from '../bus'
import {
  getOriginalStackFrames,
  OriginalStackFrame,
} from '../helpers/stack-frame'

export type SupportedErrorEvent = {
  id: number
  event: UnhandledError | UnhandledRejection
}
export type ErrorsProps = { errors: SupportedErrorEvent[] }

type ReadyRuntimeError = {
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

  // Reset component state when there are no errors to be displayed.
  // This should never happen, but lets handle it.
  React.useEffect(() => {
    if (errors.length < 1) {
      setLookups({})
    }
  }, [errors.length])

  // This component shouldn't be rendered with no errors, but if it is, let's
  // handle it gracefully by rendering nothing.
  if (errors.length < 1) {
    return null
  }

  if (isLoading) {
    // TODO: render loading state in bottom left
    return null
  }

  // TODO: implement UI
  return null
}
