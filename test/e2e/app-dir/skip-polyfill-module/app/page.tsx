'use client'

import React, { useState } from 'react'

export default function Page() {
  const [mounted, setMounted] = useState(true)

  // Use modern Array.prototype.at and Object.hasOwn natively
  const items = ['zero', 'one', 'two']
  const lastItem = items.at(-1)
  const hasOwnProp = Object.hasOwn({ test: 123 }, 'test')

  return (
    <main>
      <h1 id="title">Modern Browserslist Test</h1>
      <p id="item">{lastItem}</p>
      <p id="has-own">{hasOwnProp ? 'has-own-true' : 'has-own-false'}</p>
      <p id="client-mounted">{mounted ? 'client-hydrated' : 'pending'}</p>
    </main>
  )
}
