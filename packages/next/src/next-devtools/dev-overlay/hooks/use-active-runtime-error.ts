import type { ReadyRuntimeError } from '../utils/get-error-by-type'
import type { HydrationErrorState } from '../../shared/hydration-error'

import { useMemo, useState } from 'react'
import { getErrorTypeLabel, useErrorDetails } from '../container/errors'
import { extractNextErrorCode } from '../../../lib/error-telemetry-utils'

export function useActiveRuntimeError({
  runtimeErrors,
  getSquashedHydrationErrorDetails,
}: {
  runtimeErrors: ReadyRuntimeError[]
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
}) {
  const [activeIdx, setActiveIndex] = useState<number>(0)

  const isLoading = useMemo<boolean>(() => {
    return runtimeErrors.length === 0
  }, [runtimeErrors.length])

  const activeError = useMemo<ReadyRuntimeError | null>(
    () => runtimeErrors[activeIdx] ?? null,
    [activeIdx, runtimeErrors]
  )

  const errorDetails = useErrorDetails(
    activeError?.error,
    getSquashedHydrationErrorDetails
  )

  if (isLoading || !activeError) {
    return {
      isLoading,
      activeIdx,
      setActiveIndex,
      activeError: null,
      errorDetails: null,
      errorCode: null,
      errorType: null,
      notes: null,
      hydrationWarning: null,
    }
  }

  const error = activeError.error
  const errorCode = extractNextErrorCode(error)
  const errorType = getErrorTypeLabel(error, activeError.type)

  // TODO(GH#78140): May be better to always treat everything past the first blank line as notes
  // We're currently only special casing hydration error messages.
  const notes = errorDetails.notes
  const hydrationWarning = errorDetails.hydrationWarning

  return {
    isLoading,
    activeIdx,
    setActiveIndex,
    activeError,
    errorDetails,
    errorCode,
    errorType,
    notes,
    hydrationWarning,
  }
}
