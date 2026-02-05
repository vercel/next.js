import { ReactNode, Suspense } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p>
        This layout should have static instant UI. However, despite having a
        suspense around children, it's not instant because of a dynamic
        generateViewport in a child (which the Suspense doesn't catch.)
      </p>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </div>
  )
}
