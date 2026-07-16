'use client'

import { useEffect } from 'react'

// Simulates a third-party script writing to history between the router's
// traversal detection and its popstate replay: this component's effect runs
// after all insertion effects but before the parent router's effects.
export function ThirdPartyPush() {
  useEffect(() => {
    if ((window as any).__injectThirdPartyPush) {
      window.history.pushState({ thirdParty: true }, '', '/?tp=1')
    }
  }, [])
  return null
}
