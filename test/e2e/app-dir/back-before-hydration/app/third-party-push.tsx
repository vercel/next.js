'use client'

import { useEffect } from 'react'

// Simulates a third-party script writing to history after hydration has
// committed but before the router has taken over: this component's effect
// runs after all insertion effects but before the parent router's effects.
export function ThirdPartyPush() {
  useEffect(() => {
    if ((window as any).__injectThirdPartyPush) {
      window.history.pushState(
        { thirdParty: true },
        '',
        window.location.pathname + '?tp=1'
      )
    }
  }, [])
  return null
}
