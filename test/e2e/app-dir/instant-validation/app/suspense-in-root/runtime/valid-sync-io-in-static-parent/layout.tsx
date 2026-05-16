import { cookies } from 'next/headers'
import { Suspense } from 'react'

// This layout does NOT have runtime prefetch — it's a static segment.
// The RuntimeContent component accesses cookies() then Date.now().
// In a static prefetch the render would never get past cookies() so the
// sync IO is unreachable. In a runtime prefetch, cookies() would resolve
// but this layout is not runtime-prefetchable — only the child page is.
// So the sync IO here should not error.

async function RuntimeContent() {
  await cookies()
  const now = Date.now()
  return <p>Static layout with sync IO after cookies: {now}</p>
}

export default function StaticLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <Suspense fallback={<p>Loading...</p>}>
        <RuntimeContent />
      </Suspense>
      <hr />
      {children}
    </div>
  )
}
