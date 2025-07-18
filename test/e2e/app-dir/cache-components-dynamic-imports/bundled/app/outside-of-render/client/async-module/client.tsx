'use client'
import * as React from 'react'

const modulePromise = import('./async-messages')

export function Client() {
  const messages = React.use(modulePromise).default
  return (
    <main>
      <p>{messages.title}</p>
    </main>
  )
}
