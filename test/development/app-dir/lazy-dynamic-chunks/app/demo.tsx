'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { EAGER_MARKER } from './eager-dep'

// `ssr: false` keeps the target out of the server graph, and gating the render behind a click
// keeps the browser from requesting the chunk until the test asks for it.
const LazyTarget = dynamic(
  () => import('./lazy-target').then((mod) => mod.LazyTarget),
  {
    ssr: false,
    loading: () => <p id="loading">loading</p>,
  }
)

export function Demo() {
  const [show, setShow] = useState(false)

  return (
    <>
      <p id="eager">{EAGER_MARKER}</p>
      <button id="render-target" onClick={() => setShow(true)}>
        render target
      </button>
      {show ? <LazyTarget /> : <p id="idle">idle</p>}
    </>
  )
}
