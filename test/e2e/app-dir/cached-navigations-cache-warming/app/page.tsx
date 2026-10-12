import { setTimeout } from 'node:timers/promises'
import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'

type Props = {
  searchParams: Promise<{ cacheKey?: string | string[] }>
}

async function cachedRead(name: string) {
  'use cache'
  return name
}

async function CachedChild({ cacheKey }: { cacheKey: string }) {
  return <p id="content">{await cachedRead(`${cacheKey}:content`)}</p>
}

async function DynamicChild({ cacheKey }: { cacheKey: string }) {
  await connection()
  await setTimeout(100)
  return <p id="dynamic-content">{await cachedRead(`${cacheKey}:dynamic`)}</p>
}

function LargeTree({ depth, cacheKey }: { depth: number; cacheKey: string }) {
  if (depth === 0) {
    return <CachedChild cacheKey={cacheKey} />
  }

  // Flight defers the child after this text exceeds its size threshold of 3200.
  // The nesting tests whether cache warming waits for those descendant tasks.
  return (
    <section>
      {'x'.repeat(3201)}
      <LargeTree depth={depth - 1} cacheKey={cacheKey} />
    </section>
  )
}

async function Content({ searchParams }: Props) {
  const { cacheKey } = await searchParams
  if (typeof cacheKey !== 'string' || cacheKey.length === 0) {
    throw new Error('A non-empty cacheKey search parameter is required')
  }
  const first = await cachedRead(`${cacheKey}:first`)
  return (
    <div>
      <Link href={{ pathname: '/hub', query: { cacheKey } }} prefetch={false}>
        Go to hub
      </Link>
      <p>{first}</p>
      <LargeTree depth={3} cacheKey={cacheKey} />
      <Suspense fallback={<p id="dynamic-fallback">Loading dynamic...</p>}>
        <DynamicChild cacheKey={cacheKey} />
      </Suspense>
    </div>
  )
}

export default function Page({ searchParams }: Props) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  )
}
