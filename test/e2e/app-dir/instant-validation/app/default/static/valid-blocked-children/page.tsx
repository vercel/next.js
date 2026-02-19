import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <main>
        <Link href="/default/static/valid-blocked-children/child">Child</Link>
        <p>
          The page blocks on dynamic content, but shows a fallback, so it's
          instant
        </p>
        <DynamicInPage />
      </main>
    </Suspense>
  )
}

async function DynamicInPage() {
  await connection()
  return 'Dynamic content from page'
}
