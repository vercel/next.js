import React from 'react'
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
  unstable_noStore as noStore,
} from 'next/cache'
import { RevalidateButtons } from './buttons'

export const dynamic = 'force-dynamic'

async function getData_auto() {
  'use cache'
  cacheLife({
    revalidate: 3,
  })
  return Math.random()
}

async function getData_default() {
  'use cache: default'
  cacheLife({
    revalidate: 3,
  })
  return Math.random()
}

async function getData_indirect() {
  'use cache: indirect'
  cacheLife({
    revalidate: 3,
  })
  return Math.random()
}

async function getData_remote() {
  'use cache: remote'
  cacheLife({
    revalidate: 3,
  })
  return Math.random()
}

async function getData_bridge() {
  'use cache: bridge'
  cacheLife({
    revalidate: 3,
  })
  return Math.random()
}

async function getData_custom() {
  'use cache: custom'
  cacheLife({
    revalidate: 3,
  })
  cacheTag('custom')
  return Math.random()
}

async function AsyncComp() {
  const data = await Promise.all([
    getData_auto(),
    getData_default(),
    getData_indirect(),
    getData_remote(),
    getData_bridge(),
    getData_custom(),
  ])
  return (
    <>
      <ul>
        {data.map((d, i) => (
          <li key={i} data-item={i}>
            {d}
          </li>
        ))}
      </ul>
      <RevalidateButtons />
    </>
  )
}

export default async function Home() {
  noStore()
  return (
    <main>
      <React.Suspense fallback={<p>Loading...</p>}>
        <AsyncComp />
      </React.Suspense>
    </main>
  )
}
