'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & {
    digest?: string
    statusCode: number
  }
  reset: () => void
}) {
  console.log('error render')

  return (
    <main>
      <h1>Error</h1>
      <div id="random-number">Random: {Math.random()}</div>
      <p>{error.message}</p>
      <button onClick={reset}>Reset</button>
    </main>
  )
}
