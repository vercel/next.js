'use client'

export default function ContentError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div>
      <h2>Content Error: {error.message}</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
