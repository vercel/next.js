'use client'

import { use } from 'react'
import { unstable_noStore } from 'next/cache'

let gate: Promise<Response> | undefined

export function ClientDynamic() {
  if (typeof window === 'undefined') {
    if (!gate) {
      const origin = process.env['DEV_INDICATOR_GATE_ORIGIN']
      if (!origin) throw new Error('Missing gate origin')
      gate = fetch(`${origin}/__gate/client`, { cache: 'force-cache' })
    }
    use(gate)
    unstable_noStore()
  }
  return <p id="client-dynamic">Client SSR used noStore.</p>
}
