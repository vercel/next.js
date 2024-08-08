import React, { Suspense } from 'react'

import { Dynamic } from './dynamic'

export function Page({ suspense = false }) {
  let slot = <Dynamic />
  if (suspense) {
    slot = <Suspense fallback={<Dynamic fallback />}>{slot}</Suspense>
  }

  return (
    <>
      <h2>Dynamic Component</h2>
      <p>
        This shows the dynamic component based on the existence of the{' '}
        <code>session</code>
        cookie.
      </p>
      <div id="container">{slot}</div>
    </>
  )
}

export function NonSuspensePage() {
  return <Page />
}

export function SuspensePage() {
  return <Page suspense />
}
