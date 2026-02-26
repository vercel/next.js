'use client'

export default function ErrorBoundary({
  error,
  reset,
  unstable_retry,
  componentStack,
  ownerStack,
}) {
  return (
    <>
      <p id="error-boundary-message">{error.message}</p>
      <p id="error-boundary-digest">{error.digest}</p>
      <p id="error-component-stack">{componentStack}</p>
      <p id="error-owner-stack">{ownerStack}</p>
      <button id="reset" onClick={() => reset()}>
        Try again
      </button>
      <button id="retry" onClick={() => unstable_retry()}>
        Retry
      </button>
    </>
  )
}
