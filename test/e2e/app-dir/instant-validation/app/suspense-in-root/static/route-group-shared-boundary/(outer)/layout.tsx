import { ReactNode, Suspense } from 'react'

// This layout has Suspense around children. When both (outer) and (inner)
// are in the new tree (groupDepth=0), the Suspense covers (inner)'s
// blocking cookies() call. But when (outer) is shared (groupDepth=1),
// the Suspense is already mounted and doesn't cover the new tree.
export default function OuterLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>Outer route group layout (has Suspense around children)</em>
      <Suspense fallback={<div>Loading outer...</div>}>{children}</Suspense>
    </div>
  )
}
