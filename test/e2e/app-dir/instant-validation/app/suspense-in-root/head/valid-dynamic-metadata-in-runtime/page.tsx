import { Metadata } from 'next'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export async function generateMetadata(): Promise<Metadata> {
  await connection()
  return {
    title: 'Blocked by connection',
  }
}

export default async function Page() {
  await cookies()
  return (
    <main>
      <p>
        This page has a generateMetadata that accesses connection. It's
        runtime-prefetchable, but metadata doesn't block, so it's fine.
      </p>
      <p>
        We also access connection in the page itself, because a runtime page
        with dynamic metadata is not allowed.
      </p>
      <Suspense>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return null
}
