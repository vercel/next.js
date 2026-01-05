'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Use localStorage to persist that error boundary rendered, even across page reload
  // This is needed because console logs are cleared on page reload
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      '__ERROR_BOUNDARY_RENDERED__',
      JSON.stringify({
        rendered: true,
        message: error.message,
        time: Date.now(),
      })
    )
  }

  return (
    <div id="error-boundary">
      <h2>Something went wrong!</h2>
      <p id="error-message">{error.message}</p>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
