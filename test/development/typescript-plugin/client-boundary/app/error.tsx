'use client'

// Error boundaries receive `error`, `reset`, and `retry` from the
// framework. `reset` and `retry` are functions, but they are injected
// by Next.js rather than passed by the user, so the client-entry serialization
// rule must not flag them. `_notExempt` is an ordinary function prop and
// must still be flagged, proving the exemption stays scoped to error-boundary
// props.
export default function Error({
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
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()}>Reset</button>
      <button onClick={() => retry()}>Try again</button>
      <button onClick={() => _notExempt()}>Nope</button>
    </div>
  )
}
