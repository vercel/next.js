'use client'

export default function RouteError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <>
      <p id="route-error-fallback">{error.message}</p>
      <button id="route-error-reset" onClick={reset}>
        Retry
      </button>
    </>
  )
}
