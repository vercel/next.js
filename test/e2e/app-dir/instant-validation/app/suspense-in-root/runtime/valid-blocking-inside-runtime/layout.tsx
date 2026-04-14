import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}
export const unstable_prefetch = 'runtime'

export default async function RuntimeLayout({ children }) {
  await cookies()
  return (
    <div>
      <p>The layout wraps children with Suspense.</p>
      <hr />
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </div>
  )
}
