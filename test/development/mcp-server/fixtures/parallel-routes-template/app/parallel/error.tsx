'use client'

export default function ParallelError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div>
      <h2>Parallel Error: {error.message}</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
