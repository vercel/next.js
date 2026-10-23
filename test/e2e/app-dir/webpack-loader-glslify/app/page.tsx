'use client'

import vertex from '../shaders/card.vert'
import fragment from '../shaders/card.frag'

export default function Page() {
  return (
    <>
      <pre id="vertex">{vertex}</pre>
      <pre id="fragment">{fragment}</pre>
    </>
  )
}
