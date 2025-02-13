import type {
  OverlayState,
  UnhandledErrorAction,
  UnhandledRejectionAction,
} from '../../../../shared'

import { useMemo, useState, useEffect } from 'react'
import {
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from '../../../../shared'
import {
  getErrorByType,
  type ReadyRuntimeError,
} from '../../../../internal/helpers/get-error-by-type'

export type SupportedErrorEvent = {
  id: number
  event: UnhandledErrorAction | UnhandledRejectionAction
}

function getErrorSignature(ev: SupportedErrorEvent): string {
  const { event } = ev
  // eslint-disable-next-line default-case -- TypeScript checks this
  switch (event.type) {
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
      return `${event.reason.name}::${event.reason.message}::${event.reason.stack}`
    }
  }
}

type Props = {
  children: (params: {
    readyErrors: ReadyRuntimeError[]
    totalErrorCount: number
  }) => React.ReactNode
  state: OverlayState
  isAppDir: boolean
}

export const RenderError = (props: Props) => {
  const { state } = props
  const isBuildError =
    !!state.rootLayoutMissingTags?.length || !!state.buildError

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

  const [readyErrors, nextError] = useMemo<
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

  return children({ readyErrors, totalErrorCount: readyErrors.length })
}

const RenderBuildError = ({ children }: Props) => {
  return children({
    readyErrors: [],
    // Build errors and missing root layout tags persist until fixed,
    // so we can set a fixed error count of 1
    totalErrorCount: 1,
  })
}
