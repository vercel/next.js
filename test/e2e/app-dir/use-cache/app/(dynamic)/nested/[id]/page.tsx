import { connection } from 'next/server'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Inner() {
  await setTimeout(1000)

  return <p className="inner">{Math.random()}</p>
}

// We're only using the id to force using a different cache key for different
// test scenarios.
async function InnerCached({ id }: { id: string; name: string }) {
  'use cache: remote'

  return (
    <Suspense fallback={<p className="loading">Loading...</p>}>
      <Inner />
    </Suspense>
  )
}

async function OuterCached1({ id }: { id: string; name: string }) {
  'use cache: remote'

  return <InnerCached id={id} name="inner" />
}

async function OuterCached2({ id }: { id: string; name: string }) {
  'use cache: remote'

  return <InnerCached id={id} name="inner" />
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await connection()
  const { id } = await params

  return (
    <>
      <OuterCached1 id={id} name="outer1" />
      <OuterCached2 id={id} name="outer2" />
    </>
  )
}
