import { cookies } from 'next/headers'
import { Suspense } from 'react'

// This layout does NOT have runtime prefetch — it's a static segment.
// The sync IO after cookies() is valid here because this segment won't
// be runtime prefetched.

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
