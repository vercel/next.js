import { Instant } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [{ params: { slug: '123' } }],
}

export default function Page() {
  return (
    <main>
      <p>
        This is a page with an icon component that uses params. It has a dynamic
        hole, because a static page can't have non-static metadata.
      </p>
      <Suspense>
        <Dummy />
      </Suspense>
    </main>
  )
}

async function Dummy() {
  // TODO(instant-validation): this shouldn't need connection(), cookies should be enough
  // await cookies()
  await connection()
  return null
}
