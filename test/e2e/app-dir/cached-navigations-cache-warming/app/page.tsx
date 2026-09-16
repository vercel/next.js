import { setTimeout } from 'node:timers/promises'
import { Suspense } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

async function cachedRead(name: string) {
  'use cache'
  return name
}

async function CachedChild() {
  return <p id="content">{await cachedRead('content')}</p>
}

async function DynamicChild() {
  await connection()
  await setTimeout(100)
  return <p id="dynamic-content">{await cachedRead('dynamic')}</p>
}

function LargeTree({ depth }: { depth: number }) {
  if (depth === 0) {
    return <CachedChild />
  }

  // Flight defers the child after this text exceeds its size threshold of 3200.
  // The nesting tests whether cache warming waits for those descendant tasks.
  return (
    <section>
      {'x'.repeat(3201)}
      <LargeTree depth={depth - 1} />
    </section>
  )
}

async function Content() {
  await cookies()
  const first = await cachedRead('first')
  return (
    <div>
      <p>{first}</p>
      <LargeTree depth={3} />
      <Suspense fallback={<p id="dynamic-fallback">Loading dynamic...</p>}>
        <DynamicChild />
      </Suspense>
    </div>
  )
}

export default function Page() {
  return (
    <>
      <Link href="/hub" prefetch={false}>
        Go to hub
      </Link>
      <Suspense fallback={<p>Loading...</p>}>
        <Content />
      </Suspense>
    </>
  )
}
