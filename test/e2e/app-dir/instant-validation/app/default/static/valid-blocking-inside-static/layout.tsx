import { Suspense } from 'react'

export const unstable_instant = true

export default function StaticLayout({ children }) {
  return (
    <div>
      <p>The layout wraps children with Suspense.</p>
      <hr />
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </div>
  )
}
