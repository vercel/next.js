import { randomUUID } from 'node:crypto'
import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { connection } from 'next/server'

function CachedLeaf({ generation }: { generation: string }) {
  return <p id="cached-generation">{generation}</p>
}

async function CachedTree() {
  'use cache'
  cacheLife('hours')
  return <CachedLeaf generation={randomUUID()} />
}

async function RequestContent() {
  await connection()
  return <CachedTree />
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <RequestContent />
    </Suspense>
  )
}
