// @ts-nocheck
/* eslint-disable */
'use client'

export default function GlobalError(props: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => props.reset()}>Try again</button>
        <button onClick={() => props.unstable_retry()}>Retry</button>
      </body>
    </html>
  )
}
