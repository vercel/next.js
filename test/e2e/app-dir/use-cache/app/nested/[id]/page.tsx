import { connection } from 'next/server'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Inner() {
  await setTimeout(2000)

  return <p className="inner">{Math.random()}</p>
}

// We're only using the id to force using a different cache key for different
// test scenarios.
async function InnerCached({ id }: { id: string }) {
  'use cache'

  return (
    <Suspense fallback={<p className="loading">Loading...</p>}>
      <Inner />
    </Suspense>
  )
}

async function OuterCached1({ id }: { id: string }) {
  'use cache'

  return <InnerCached id={id} />
}

async function OuterCached2({ id }: { id: string }) {
  'use cache'

  return <InnerCached id={id} />
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
      <OuterCached1 id={id} />
      <OuterCached2 id={id} />
    </>
  )
}
