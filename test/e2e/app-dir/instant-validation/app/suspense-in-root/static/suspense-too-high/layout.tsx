import { ReactNode, Suspense } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  // TODO: technically, we could consider this is valid,
  // because this layout isn't shared with anything else,
  // so we'll always prefetch it together with the page and not have a blocking nav.
  return (
    <div>
      <p>this layout adds a suspense boundary around children:</p>
      <div style={{ padding: '1em', border: '1px solid blue' }}>
        <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
      </div>
    </div>
  )
}
