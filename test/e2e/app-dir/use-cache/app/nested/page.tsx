import { connection } from 'next/server'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Inner() {
  await setTimeout(3000)

  return <p className="inner">{Math.random()}</p>
}

async function InnerCached() {
  'use cache'

  return (
    <Suspense fallback={<p className="loading">Loading...</p>}>
      <Inner />
    </Suspense>
  )
}

async function OuterCached1() {
  'use cache'

  return <InnerCached />
}

async function OuterCached2() {
  'use cache'

  return <InnerCached />
}

export default async function Page() {
  await connection()

  return (
    <>
      <OuterCached1 />
      <OuterCached2 />
    </>
  )
}
