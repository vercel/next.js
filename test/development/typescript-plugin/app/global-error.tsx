'use client'

export default function GlobalError({
  error,
  reset,
  unstable_retry,
  //^^^ `reset` and `unstable_retry` are fine because they are the special
  // framework-injected function props in a global-error file
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
        <button onClick={() => unstable_retry()}>Retry</button>
      </body>
    </html>
  )
}
