// No config. Just a passthrough wrapper. This sits *inside* the
// validation boundary's subtree (the boundary lands at `inner/` because
// the configured layout is one level shallower). If we pick the
// "first mod inside the boundary subtree" correctly, this layout's
// path is what we'd expect to surface — distinct from the configured
// `test-firstmod/layout.tsx` above.
import { ReactNode } from 'react'

export default function InnerLayout({ children }: { children: ReactNode }) {
  return <section>{children}</section>
}
