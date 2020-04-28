import * as React from 'react'
import { StackFrame } from 'stacktrace-parser'
import {
  getResolvedRuntimeError,
  ResolvedRuntimeError,
  ResolvedRuntimeErrors,
} from './ResolvedRuntimeErrors'

export type RuntimeErrorObject = {
  eventId: string
  error: Error
  frames: StackFrame[]
}
export type RuntimeErrorsProps = { errors: RuntimeErrorObject[] }

export const RuntimeErrors: React.FC<RuntimeErrorsProps> = function RuntimeErrors({
  errors,
}) {
  const [resolved, setResolved] = React.useState(
    {} as { [eventId: string]: ResolvedRuntimeError }
  )

  const [readyErrors, nextError] = React.useMemo<
    [ResolvedRuntimeError[], RuntimeErrorObject | null]
  >(() => {
    let ready: ResolvedRuntimeError[] = []
    let next: RuntimeErrorObject | null = null

    // Ensure errors are displayed in the order they occurred in:
    for (let idx = 0; idx < errors.length; ++idx) {
      const e = errors[idx]
      const { eventId } = e
      if (eventId in resolved) {
        ready.push(resolved[eventId])
        continue
      }

      // Check for duplicate errors
      if (idx > 0) {
        const prev = errors[idx - 1]
        if (
          e.error.name === prev.error.name &&
          e.error.message === prev.error.message
        ) {
          continue
        }
      }

      next = e
      break
    }

    return [ready, next]
  }, [errors, resolved])

  const isLoading = React.useMemo<boolean>(() => {
    return readyErrors.length < 1 && Boolean(errors.length)
  }, [errors.length, readyErrors.length])

  React.useEffect(() => {
    if (nextError == null) {
      return
    }
    getResolvedRuntimeError(nextError).then(
      resolved => {
        // We don't care if the desired error changed while we were resolving,
        // thus we're not tracking it using a ref. Once the work has been done,
        // we'll store it.
        setResolved(m => ({ ...m, [resolved.eventId]: resolved }))
      },
      () => {
        // TODO: handle
      }
    )
  }, [nextError])

  // Reset component state when there are no errors to be displayed.
  // This should never happen, but lets handle it.
  React.useEffect(() => {
    if (errors.length < 1) {
      setResolved({})
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

  return <ResolvedRuntimeErrors errors={readyErrors} />
}
