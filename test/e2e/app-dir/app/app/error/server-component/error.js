'use client'

export default function ErrorBoundary({ error, reset }) {
  return (
    <>
      <p id="error-boundary-message">{error.message}</p>
      <p id="error-boundary-digest">{error.digest}</p>
      <button id="reset" onClick={() => reset()}>
        Try again
      </button>
    </>
  )
}
