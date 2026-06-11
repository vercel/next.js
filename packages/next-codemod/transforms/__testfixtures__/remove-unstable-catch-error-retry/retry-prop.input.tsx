// @ts-nocheck
/* eslint-disable */
'use client'

export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
      <button onClick={() => unstable_retry()}>Retry</button>
    </div>
  )
}
