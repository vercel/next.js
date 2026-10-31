'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, use, useState } from 'react'

// Stands in for a client data library that suspends on a cache keyed by the
// query.
const cache = new Map<string, Promise<string>>()

function load(q: string): Promise<string> {
  let promise = cache.get(q)
  if (promise === undefined) {
    promise = Promise.resolve(q)
    cache.set(q, promise)
  }
  return promise
}

function Content() {
  const q = useSearchParams().get('q')
  // Only suspends for the URLs written by the test, so the initial load
  // doesn't depend on it.
  const loaded = q === null ? '(none)' : use(load(q))
  const [value, setValue] = useState('')
  return (
    <>
      <p id="loaded">{loaded}</p>
      <input
        id="input"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          window.history.replaceState(null, '', `?q=${event.target.value}`)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            window.history.pushState(null, '', '?q=pushed')
          }
        }}
      />
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  )
}
