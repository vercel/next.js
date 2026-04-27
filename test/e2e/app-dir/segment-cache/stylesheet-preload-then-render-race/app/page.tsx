'use client'

import { useEffect } from 'react'

import { preload } from 'react-dom'
import Link from 'next/link'

// Hrefs the destination route will render. We preload all of them on
// `/` mount to mimic the production scenario: Next's prefetch
// instrumentation emits L (preload) opcodes for the destination
// route's CSS chunks during the SOURCE page's render, populating
// `preloadPropsMap` for each href.
const STYLESHEET_HREFS = [
  '/test-style-a.css',
  '/test-style-b.css',
  '/test-style-c.css',
]

export default function Home() {
  // `ReactDOM.preload(href, { as: 'style' })` enters via the
  // dispatcher's L slot (`react-dom-client.production.js:16619` —
  // the `preload` function), which:
  //   1. `preloadPropsMap.has(key)` → false on first call
  //   2. `preloadPropsMap.set(key, props)`             ← the troublesome write
  //   3. `<link rel="preload" as="style">` appended to <head>
  //
  // After this runs, `preloadPropsMap.has(key) === true` for the rest
  // of the page's lifetime. No React resource record exists yet —
  // there is no resource to update with the preload's loaded state.
  //
  // The bug then fires on the next navigation when `getResource`
  // creates a fresh resource and short-circuits the
  // `preloadStylesheet` call at line 16841 because the Map already
  // has the key. `state.loading` stays at 0 and the throw fires.
  useEffect(() => {
    for (const href of STYLESHEET_HREFS) {
      preload(href, { as: 'style' })
    }
  }, [])

  return (
    <main id="home">
      <h1>Home</h1>
      <Link href="/logs" id="link-logs">
        Go to /logs
      </Link>
    </main>
  )
}
