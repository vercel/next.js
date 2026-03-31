'use client'

import * as React from 'react'
import { once } from '../once'

const doImport = once(() => import('./async-messages'))

export function Client() {
  const messages = React.use(doImport()).default
  return (
    <main>
      <p>{messages.title}</p>
    </main>
  )
}
