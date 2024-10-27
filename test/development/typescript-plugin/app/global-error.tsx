'use client'

export default function GlobalError({
  error,
  reset,
  //^^^ fine because it's the special reset prop in a global-error file
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
