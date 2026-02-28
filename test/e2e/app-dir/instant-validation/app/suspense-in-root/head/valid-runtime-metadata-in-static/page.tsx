import { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'static',
}

export async function generateMetadata(): Promise<Metadata> {
  await cookies()
  return {
    title: 'Blocked by cookies',
  }
}

export default function Page() {
  return (
    <main>
      <p>This page has a generateMetadata that accesses cookies.</p>
      <p>
        We also access cookies in the page itself, because a static page with
        non-static metadata is not allowed.
      </p>
      <Suspense>
        <Runtime />
      </Suspense>
    </main>
  )
}

async function Runtime() {
  await cookies()
  return null
}
