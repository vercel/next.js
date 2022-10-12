'use client'

export default function ErrorBoundary({ error, reset }) {
  return (
    <>
      <p id="error-boundary-message">An error occurred: {error.message}</p>
      <button id="reset" onClick={() => reset()}>
        Try again
      </button>
    </>
  )
}
