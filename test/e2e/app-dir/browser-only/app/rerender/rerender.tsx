'use client'

import { use, useState } from 'react'
import { browserOnly } from 'next/navigation'

function BrowserOnlyValue({ id }: { id: string }) {
  use(browserOnly())
  return <span id={id}>ready</span>
}

export function Rerender() {
  use(browserOnly())
  const [count, setCount] = useState(0)

  return (
    <>
      <p id="render-count">{count}</p>
      <BrowserOnlyValue id="first-value" />
      <BrowserOnlyValue id="second-value" />
      <button id="rerender" onClick={() => setCount((value) => value + 1)}>
        rerender
      </button>
    </>
  )
}
