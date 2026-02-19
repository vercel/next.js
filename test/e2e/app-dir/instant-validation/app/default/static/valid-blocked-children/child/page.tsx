import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <main>
        <Link href="/default/static/valid-blocked-children">Parent</Link>
        <p>
          The page blocks on dynamic content, but shows a fallback, so it's
          instant
        </p>
        <DynamicInChild />
      </main>
    </Suspense>
  )
}

const connections = new WeakSet()
async function DynamicInChild() {
  const nextConnection = connection()
  if (connections.has(nextConnection)) {
    console.log('Connection reused')
  } else {
    console.log('New connection')
    connections.add(nextConnection)
  }
  await nextConnection
  return 'Dynamic content from page child'
}
