import { connection } from 'next/server'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function DelayedContent() {
  await setTimeout(1000)
  return <p className="content">{Math.random()}</p>
}

async function Cached() {
  // We use a custom no-store cache handler here to ensure we're actually
  // testing the deduping behavior in the cache wrapper, and not a pending set
  // locking mechanism that the cache handler might implement (as the default
  // handler does).
  'use cache: no-store'

  return (
    <Suspense fallback={<p className="loading">Loading...</p>}>
      <DelayedContent />
    </Suspense>
  )
}

export default async function Page() {
  await connection()

  return <Cached />
}
