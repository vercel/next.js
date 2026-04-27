'use client'

import { useLayoutEffect, useRef } from 'react'

// Tripwire that fires when (and only when) the layout's `<Suspense>`
// fallback is committed to the DOM. If the destination tree commits in
// one shot, this never mounts — and the test asserts `__FALLBACK_MOUNTED`
// is true, so the test fails when the bug is fixed (by design — this is a
// regression repro, not a happy-path test).
//
// `useLayoutEffect` fires synchronously after commit, before the browser
// paints, so it's the earliest reliable signal that the fallback was
// committed. Recording the timestamp lets the test bound how long the
// empty shell was visible.
export function FallbackProbe() {
  const fired = useRef(false)
  useLayoutEffect(() => {
    if (fired.current) return
    fired.current = true
    const w = window as unknown as {
      __FALLBACK_MOUNTED?: boolean
      __FALLBACK_MOUNTED_AT?: number
    }
    w.__FALLBACK_MOUNTED = true
    w.__FALLBACK_MOUNTED_AT = performance.now()
  }, [])
  return <div id="logs-fallback">Loading…</div>
}
