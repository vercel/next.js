'use client'

import { useEffect } from 'react'

// Simulates a third-party script writing to history at one of two points the
// router cares about. The test picks one by setting `window.__thirdPartyPush`:
//
// 'render' — during hydration, after the router's store captured the URL but
//   before its first history write. A real script gets here from a timer or a
//   deferred script that fires while the page is hydrating.
// 'effect' — after the router detected the missed traversal but before it
//   replays it. Child effects run before the parent router's.
function pushIfArmed(at: 'render' | 'effect') {
  if (
    typeof window === 'undefined' ||
    (window as any).__thirdPartyPush !== at
  ) {
    return
  }
  ;(window as any).__thirdPartyPush = undefined
  window.history.pushState(
    { thirdParty: true },
    '',
    window.location.pathname + '?tp=1'
  )
}

export function ThirdPartyPush() {
  pushIfArmed('render')
  useEffect(() => {
    pushIfArmed('effect')
  }, [])
  return null
}
