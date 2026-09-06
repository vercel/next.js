import { useState } from 'react'
import { catchError, type ErrorInfo } from 'next/error'

function ErrorFallback(
  { clearError }: { clearError: () => void },
  { error, reset, retry }: ErrorInfo
) {
  const [retryError, setRetryError] = useState<string | null>(null)

  return (
    <>
      <p id="pages-error-message">{(error as Error).message}</p>
      <button
        id="pages-reset"
        onClick={() => {
          clearError()
          reset()
        }}
      >
        Reset
      </button>
      <button
        id="pages-retry"
        onClick={() => {
          try {
            retry()
          } catch (error) {
            setRetryError((error as Error).message)
          }
        }}
      >
        Retry
      </button>
      {retryError ? <p id="pages-retry-error">{retryError}</p> : null}
    </>
  )
}

const ErrorBoundary = catchError(ErrorFallback)

function ErrorThrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('this is a pages test')
  }

  return null
}

export default function Page() {
  const [shouldThrow, setShouldThrow] = useState(false)

  return (
    <ErrorBoundary clearError={() => setShouldThrow(false)}>
      <button id="pages-trigger" onClick={() => setShouldThrow(true)}>
        Trigger Error!
      </button>
      <ErrorThrower shouldThrow={shouldThrow} />
    </ErrorBoundary>
  )
}
