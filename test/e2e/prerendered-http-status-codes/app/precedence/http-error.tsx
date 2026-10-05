'use client'

import { Suspense, use } from 'react'
import {
  forbidden,
  notFound,
  permanentRedirect,
  redirect,
  unauthorized,
} from 'next/navigation'

function throwHTTPError(type: string, destination: string) {
  switch (type) {
    case 'not-found':
      return notFound()
    case 'unauthorized':
      return unauthorized()
    case 'forbidden':
      return forbidden()
    case 'redirect':
      return redirect(destination)
    case 'permanent-redirect':
      return permanentRedirect(destination)
    default:
      throw new Error(`Unknown HTTP error type: ${type}`)
  }
}

function FirstError({ type, onError }: { type: string; onError: () => void }) {
  try {
    return throwHTTPError(type, '/first')
  } finally {
    onError()
  }
}

function SecondError({ type, after }: { type: string; after: Promise<void> }) {
  use(after)
  return throwHTTPError(type, '/second')
}

export function HTTPErrorPair({
  first,
  second,
  boundary,
}: {
  first: string
  second: string
  boundary: string
}) {
  let resolveFirstError: () => void
  const firstError = new Promise<void>((resolve) => {
    resolveFirstError = resolve
  })
  // Prerendering can defer Suspense children until after the shell. Wait for
  // the first error before rendering the second, even when it is in the shell.
  // The promise belongs to this render, so routes and prerender passes do not
  // share state. Its continuation runs after React handles the first error.
  const secondError = <SecondError type={second} after={firstError} />

  return (
    <>
      <h1 id="precedence-layout">HTTP error precedence</h1>
      <Suspense fallback={<p id="first-fallback">First fallback</p>}>
        <FirstError type={first} onError={() => resolveFirstError()} />
      </Suspense>
      {boundary === 'suspense' ? (
        <Suspense fallback={<p id="second-fallback">Second fallback</p>}>
          {secondError}
        </Suspense>
      ) : (
        // Exercise the recovery catch as well as the HTML error callback.
        secondError
      )}
    </>
  )
}
