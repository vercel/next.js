/**
 * Thin React component that installs the router-act fetch monkey-patch.
 * Render this in the test fixture's root layout. The useEffect cleanup
 * restores the original fetch on unmount.
 *
 * This component must be rendered so the monkey-patch is installed after
 * hydration, when the router is active and making fetch calls.
 */
'use client'

import { useEffect } from 'react'
import { installRouterActSetup } from './setup'

export function RouterAct() {
  useEffect(() => installRouterActSetup(), [])
  return null
}
