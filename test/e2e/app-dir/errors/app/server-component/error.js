'use client'

export default function ErrorBoundary({ error, reset, unstable_retry }) {
  return (
    <>
      <p id="error-boundary-message">{error.message}</p>
      <p id="error-boundary-digest">{error.digest}</p>
      <button id="reset" onClick={() => reset()}>
        Try again
      </button>
      <button id="retry" onClick={() => unstable_retry()}>
        Retry
      </button>
    </>
  )
}
