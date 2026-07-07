'use client'

export default function GlobalError({
  error,
  reset,
  retry,
  //^^^ `reset` and `retry` are fine because they are the special
  // framework-injected function props in a global-error file
}: {
  error: Error & { digest?: string }
  reset: () => void
  retry: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
        <button onClick={() => retry()}>Retry</button>
      </body>
    </html>
  )
}
