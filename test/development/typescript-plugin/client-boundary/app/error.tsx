'use client'

// Error boundaries receive `error`, `reset`, and `unstable_retry` from the
// framework. `reset` and `unstable_retry` are functions, but they are injected
// by Next.js rather than passed by the user, so the client-entry serialization
// rule must not flag them. `_notExempt` is an ordinary function prop and
// must still be flagged, proving the exemption stays scoped to error-boundary
// props.
export default function Error({
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
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()}>Reset</button>
      <button onClick={() => unstable_retry()}>Try again</button>
      <button onClick={() => _notExempt()}>Nope</button>
    </div>
  )
}
