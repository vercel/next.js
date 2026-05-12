import { type ReactNode } from 'react'

// This intermediate layout exports `unstable_instant = false`. The walker
// treats `false` as a per-segment no-op — it doesn't suppress validation
// of descendant page/default segments. So the bare page under this layout
// should still be implicitly validated under 'experimental-error' in dev
// AND build.
//
// The `false` here only "shields" this layout's own load from being
// considered blocking; it does not act as a global opt-out for the route.
export const unstable_instant = false

export default function LayeredLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
