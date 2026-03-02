import type { HydrationErrorState } from '../../shared/hydration-error'

import { useMemo, useState } from 'react'
import {
  getErrorTypeLabel,
  useErrorDetails,
  type ErrorDetails,
} from '../container/errors'
import { extractNextErrorCode } from '../../../lib/error-telemetry-utils'
import type { SupportedErrorEvent } from '../container/runtime-error/render-error'

type ActiveRuntimeError =
  | {
      activeIdx: number | null
      setActiveIndex: (idx: number) => void
      activeError: null
      errorDetails: ErrorDetails
      errorCode: null
      errorType: null
    }
  | {
      activeIdx: number
      setActiveIndex: (idx: number) => void
      activeError: SupportedErrorEvent
      errorDetails: ErrorDetails
      errorCode: string | undefined
      errorType: ReturnType<typeof getErrorTypeLabel>
    }

export function useActiveRuntimeError({
  runtimeErrors,
  getSquashedHydrationErrorDetails,
}: {
  runtimeErrors: readonly SupportedErrorEvent[]
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
}): ActiveRuntimeError {
  const [activeIdx, setActiveIndex] = useState<number>(0)

  const activeError = useMemo<SupportedErrorEvent | null>(
    () => runtimeErrors[activeIdx] ?? null,
    [activeIdx, runtimeErrors]
  )

  const errorDetails = useErrorDetails(
    activeError?.error,
    getSquashedHydrationErrorDetails
  )

  if (!activeError) {
    return {
      activeIdx,
      setActiveIndex,
      activeError: null,
      errorDetails,
      errorCode: null,
      errorType: null,
    }
  }

  const error = activeError.error
  const errorCode = extractNextErrorCode(error)
  const errorType = getErrorTypeLabel(error, activeError.type, errorDetails)

  return {
    activeIdx,
    setActiveIndex,
    activeError,
    errorDetails,
    errorCode,
    errorType,
  }
}
