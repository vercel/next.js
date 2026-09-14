import type { OverlayState } from '../../shared'
import type { StackFrame } from '../../../shared/stack-frame'

import { useMemo, useState, useEffect } from 'react'
import {
  getErrorByType,
  type ReadyRuntimeError,
} from '../../utils/get-error-by-type'
import { isInstantNavigationError } from '../errors'

export type SupportedErrorEvent = {
  id: number
  error: Error
  frames: readonly StackFrame[]
  type: 'runtime' | 'recoverable' | 'console'
  /** Whether the error caused Next.js to replace the application UI. */
  isFatal: boolean
}

type Props = {
  children: (params: {
    runtimeErrors: ReadyRuntimeError[]
    totalErrorCount: number
    normalErrorCount: number
    instantErrorCount: number
  }) => React.ReactNode
  state: OverlayState
  isAppDir: boolean
}

export const RenderError = (props: Props) => {
  const { state } = props
  const isBuildError = !!state.buildError

  if (isBuildError) {
    return <RenderBuildError {...props} />
  } else {
    return <RenderRuntimeError {...props} />
  }
}

const RenderRuntimeError = ({ children, state, isAppDir }: Props) => {
  const { errors } = state

  const [lookups, setLookups] = useState<{
    [eventId: string]: {
      event: SupportedErrorEvent
      resolved: ReadyRuntimeError
    }
  }>({})

  const [runtimeErrors, nextError] = useMemo<
    [ReadyRuntimeError[], SupportedErrorEvent | null]
  >(() => {
    let ready: ReadyRuntimeError[] = []
    let next: SupportedErrorEvent | null = null

    // Ensure errors are displayed in the order they occurred in:
    for (let idx = 0; idx < errors.length; ++idx) {
      const e = errors[idx]
      const { id } = e
      if (id in lookups) {
        const lookup = lookups[id]
        const resolved = lookup.resolved
        if (lookup.event !== e) {
          // Dedupe promotion preserves the ID while replacing the event.
          // Keep the overlay mounted while resolving the replacement frames.
          if (next === null) next = e
          ready.push(
            resolved.type === e.type ? resolved : { ...resolved, type: e.type }
          )
          continue
        }
        ready.push(resolved)
        continue
      }

      if (next === null) next = e
      break
    }

    return [ready, next]
  }, [errors, lookups])

  useEffect(() => {
    if (nextError == null) {
      return
    }

    const resolved = getErrorByType(nextError, isAppDir)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO: fetch-while-rendering
    setLookups((m) => ({
      ...m,
      [resolved.id]: { event: nextError, resolved },
    }))
  }, [nextError, isAppDir])

  const totalErrorCount = errors.length
  const instantErrorCount = useMemo(
    () => runtimeErrors.filter((e) => isInstantNavigationError(e.error)).length,
    [runtimeErrors]
  )
  const normalErrorCount = runtimeErrors.length - instantErrorCount

  return children({
    runtimeErrors,
    totalErrorCount,
    normalErrorCount,
    instantErrorCount,
  })
}

const RenderBuildError = ({ children }: Props) => {
  return children({
    runtimeErrors: [],
    // Build errors and missing root layout tags persist until fixed,
    // so we can set a fixed error count of 1
    totalErrorCount: 1,
    normalErrorCount: 1,
    instantErrorCount: 0,
  })
}
