import { ReactNode } from 'react'

// Outer layout: configured for instant validation, no errors. Renders
// children cleanly so this depth's iteration of the validation loop
// validates without producing errors or fallback. Used together with
// the deeper inner page config to exercise the multi-depth deferral
// path: the inner depth defers a missing-boundary fallback, this
// (shallower) depth has nothing to report, and the deferred fallback
// surfaces only after the loop has exhausted every depth.
export const unstable_instant = { level: 'experimental-error' }

export default function Layout({ children }: { children: ReactNode }) {
  return <main>{children}</main>
}
