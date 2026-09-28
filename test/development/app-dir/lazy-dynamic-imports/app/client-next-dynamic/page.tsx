'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

const Target = dynamic(() => import('./target'))

export default function Page() {
  const [show, setShow] = useState(false)

  return (
    <>
      <button id="show-next-dynamic" onClick={() => setShow(true)}>
        show
      </button>
      {show ? <Target /> : <p id="next-dynamic-idle">not rendered</p>}
    </>
  )
}
