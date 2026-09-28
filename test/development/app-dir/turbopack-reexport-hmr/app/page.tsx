'use client'

import { value } from '../lib/forwarder'
import { namespace } from '../lib/namespace-lib'

export default function Page() {
  return (
    <main>
      <p id="forwarded">{value}</p>
      <p id="namespace">{namespace.member}</p>
    </main>
  )
}
