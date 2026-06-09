// This layout has prefetching disabled because it performs uncached dynamic
// I/O (connection()). Static parents above it should be able to inline through
// it and into the static child below, because this layout acts as a transparent
// pass-through — its slot in the bundle is null but the chain isn't broken.
import { ReactNode, Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_instant = false
export const prefetch = 'force-disabled'

async function DynamicContent() {
  await connection()
  return <p id="layout-instant-false-passthrough">Dynamic layout</p>
}

export default function InstantFalsePassthroughLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div>
      <Suspense fallback={<p>Loading...</p>}>
        <DynamicContent />
      </Suspense>
      {children}
    </div>
  )
}
