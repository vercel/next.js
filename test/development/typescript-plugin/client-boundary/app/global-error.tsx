'use client'

// `global-error.tsx` receives the same framework-injected props as `error.tsx`.
// Its function props (`reset`, `retry`) are provided by Next.js and
// must not be flagged as non-serializable. `_notExempt` is an ordinary function
// prop and must still be flagged, proving the exemption stays scoped to known
// error-boundary props.
export default function GlobalError({
  error,
  reset,
  retry,
  _notExempt,
}: {
  error: Error & { digest?: string }
  reset: () => void
  retry: () => void
  _notExempt: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <p>{error.message}</p>
        <button onClick={() => reset()}>Reset</button>
        <button onClick={() => retry()}>Try again</button>
        <button onClick={() => _notExempt()}>Nope</button>
      </body>
    </html>
  )
}
