'use client'
import type { ErrorInfo } from 'next/error'
import { unstable_catchError } from 'next/error'

export function ErrorFallback(
  _props: {},
  { error, unstable_retry }: ErrorInfo
) {
  return (
    <>
      <div id="error-boundary-message">{error.message}</div>
      <button id="retry" onClick={() => unstable_retry()}>
        Retry
      </button>
    </>
  )
}

export default unstable_catchError(ErrorFallback)
