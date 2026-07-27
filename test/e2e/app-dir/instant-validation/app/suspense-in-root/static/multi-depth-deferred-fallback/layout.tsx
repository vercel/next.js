import { ReactNode } from 'react'

// Outer layout: configured for instant validation, no errors. Renders
// children cleanly so its own validation passes. Used together with
// the deeper inner page config (whose segment is dropped from
// rendering by the inner layout) to check that a rendered, clean
// config validates while the unrendered deeper config stays vacuous.
export const instant = { level: 'experimental-error' }

export default function Layout({ children }: { children: ReactNode }) {
  return <main>{children}</main>
}
