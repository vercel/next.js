'use client'

import { use } from 'react'
import { getValue } from '#universal'
import { sharedGetValue } from './shared'

export function ClientView() {
  return (
    <section>
      <h2>Client component</h2>
      <p id="client-direct">direct: {use(getValue())}</p>
      <p id="client-shared">via shared: {use(sharedGetValue())}</p>
    </section>
  )
}
