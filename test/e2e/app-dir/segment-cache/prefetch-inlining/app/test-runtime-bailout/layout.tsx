import { ReactNode, Suspense } from 'react'

// Small static layout. With prefetch inlining enabled, this layout's data
// should be bundled into the child's response. The child page reads cookies
// (so it needs a runtime prefetch to resolve fully), but it still has a
// static response — the static parts that don't depend on runtime data — so
// the layout inlines into that bundle.
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
