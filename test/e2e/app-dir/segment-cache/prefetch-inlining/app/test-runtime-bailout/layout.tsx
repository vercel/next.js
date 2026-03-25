import { ReactNode, Suspense } from 'react'

// Small static layout. With prefetch inlining enabled, this layout's data
// should be bundled into the child's response. But since the child page uses
// runtime prefetching, the bundle needs to be flushed as a separate static
// prefetch instead.
export default function RuntimeBailoutLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div>
      <p id="layout-runtime-bailout">Static layout content</p>
      <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
    </div>
  )
}
