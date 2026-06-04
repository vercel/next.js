'use client'

// `global-error.tsx` receives the same framework-injected props as `error.tsx`.
// Its function props (`reset`, `unstable_retry`) are provided by Next.js and
// must not be flagged as non-serializable. `_notExempt` is an ordinary function
// prop and must still be flagged, proving the exemption stays scoped to known
// error-boundary props.
export default function GlobalError({
  error,
  reset,
  unstable_retry,
  _notExempt,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry: () => void
  _notExempt: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <p>{error.message}</p>
        <button onClick={() => reset()}>Reset</button>
        <button onClick={() => unstable_retry()}>Try again</button>
        <button onClick={() => _notExempt()}>Nope</button>
      </body>
    </html>
  )
}
