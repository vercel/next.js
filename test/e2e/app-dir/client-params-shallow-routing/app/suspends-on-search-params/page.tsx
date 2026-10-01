'use client'

import { useSearchParams } from 'next/navigation'
import { use } from 'react'
import { ShallowControls } from '../shallow-controls'

const cache = new Map<string, Promise<string>>()

function load(q: string): Promise<string> {
  let promise = cache.get(q)
  if (promise === undefined) {
    promise = new Promise((resolve) => setTimeout(resolve, 500, q))
    cache.set(q, promise)
  }
  return promise
}

export default function Page() {
  const q = useSearchParams().get('q')
  // Only suspends on data for the URLs that are written by the test, so that
  // the initial load doesn't depend on it.
  const loaded = q === null ? '(none)' : use(load(q))
  return (
    <>
      <p id="loaded">{loaded}</p>
      <ShallowControls />
    </>
  )
}
