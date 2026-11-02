'use client'

// Already available from the root layout, so `loading.tsx` emits no CSS.
import '../layout-styles.css'
import { sharedValue } from './shared-module'

export function Skeleton() {
  return (
    <p id="skeleton" className="layout-styles">
      {sharedValue('loading')}
    </p>
  )
}
