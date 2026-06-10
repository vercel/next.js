import { type ReactNode } from 'react'

// This intermediate layout exports `instant = false`. The walker
// treats `false` as a per-segment no-op — it doesn't pull descendants into
// validation. Under 'experimental-manual-error', the bare descendant has
// no explicit opt-in either, so no implicit validation runs.
//
// The `false` here only "shields" this layout's own load from being
// considered blocking; it does not act as a global opt-in for the route.
export const instant = false

export default function LayeredLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
