'use client'

import { lazy, Suspense, useState } from 'react'

// Only requested once the button is clicked, so its chunks are not part of
// the server-rendered HTML.
const OnDemandWidget = lazy(() => import('./on-demand-widget'))

export function OnDemand() {
  const [show, setShow] = useState(false)
  return (
    <>
      <button id="load" onClick={() => setShow(true)}>
        load
      </button>
      {show ? (
        <Suspense fallback={<p id="on-demand-loading">loading</p>}>
          <OnDemandWidget />
        </Suspense>
      ) : null}
    </>
  )
}
