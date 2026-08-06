'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { EAGER_MARKER } from '../eager-dep'

const InteractiveTarget = dynamic(
  () => import('./target').then((mod) => mod.InteractiveTarget),
  {
    ssr: false,
    loading: () => <p id="loading">loading</p>,
  }
)

export function InteractiveDemo() {
  const [show, setShow] = useState(false)

  return (
    <>
      <p id="eager">{EAGER_MARKER}</p>
      <button id="render-target" onClick={() => setShow(true)}>
        render target
      </button>
      {show ? <InteractiveTarget /> : <p id="idle">idle</p>}
    </>
  )
}
