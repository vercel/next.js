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

export function useErrorHook({
  state,
  isAppDir,
}: {
  state: OverlayState
  isAppDir: boolean
}) {
  const { errors, rootLayoutMissingTags, buildError } = state

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

  return {
    readyErrors,
    // Total number of errors are based on the priority that
    // will be displayed. Since build error and root layout
    // missing tags won't be dismissed until resolved, the
    // total number of errors may be fixed to their length.
    totalErrorCount: rootLayoutMissingTags?.length
      ? 1
      : !!buildError
        ? 1
        : readyErrors.length,
  }
}
