import { ReactNode, Suspense } from 'react'

// The unstable_instant config makes this route eligible for validation.
// The Suspense here covers children in the validation render (where both
// (outer) and (inner) are in the new tree), but in a real /foo → / client
// navigation, (outer)/layout is shared and its Suspense doesn't apply.
export const unstable_instant = { prefetch: 'static' }

export default function OuterLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>Outer route group layout (has Suspense around children)</em>
      <Suspense fallback={<div>Loading outer...</div>}>{children}</Suspense>
    </div>
  )
}
