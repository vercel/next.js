import type { OverlayState } from '../../shared'
import type { StackFrame } from '../../../shared/stack-frame'

import { useMemo, useState, useEffect } from 'react'
import {
  getErrorByType,
  type ReadyRuntimeError,
} from '../../utils/get-error-by-type'

export type SupportedErrorEvent = {
  id: number
  error: Error
  frames: readonly StackFrame[]
  type: 'runtime' | 'recoverable' | 'console'
}

type Props = {
  children: (params: {
    runtimeErrors: ReadyRuntimeError[]
    totalErrorCount: number
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
    [eventId: string]: ReadyRuntimeError
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
        ready.push(lookups[id])
        continue
      }

      next = e
      break
    }

    return [ready, next]
  }, [errors, lookups])

  useEffect(() => {
    if (nextError == null) {
      return
    }

    let mounted = true

    getErrorByType(nextError, isAppDir).then((resolved) => {
      if (mounted) {
        // We don't care if the desired error changed while we were resolving,
        // thus we're not tracking it using a ref. Once the work has been done,
        // we'll store it.
        setLookups((m) => ({ ...m, [resolved.id]: resolved }))
      }
    })

    return () => {
      mounted = false
    }
  }, [nextError, isAppDir])

  const totalErrorCount = errors.length

  return children({ runtimeErrors, totalErrorCount })
}

const RenderBuildError = ({ children }: Props) => {
  return children({
    runtimeErrors: [],
    // Build errors and missing root layout tags persist until fixed,
    // so we can set a fixed error count of 1
    totalErrorCount: 1,
  })
}
