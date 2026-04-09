'use client'

export default function RootError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div>
      <h2>Root Error: {error.message}</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
