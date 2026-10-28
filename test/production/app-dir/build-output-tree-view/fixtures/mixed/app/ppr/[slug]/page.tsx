import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'

type CacheLife = Parameters<typeof cacheLife>[0]

async function getCachedValue(profile: CacheLife) {
  'use cache'

  cacheLife(profile)

  return Math.random()
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: CacheLife }>
}) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  )
}

async function Content({ params }: { params: Promise<{ slug: CacheLife }> }) {
  const { slug } = await params

  return (
    <>
      <p>hello world {await getCachedValue(slug)}</p>
      <Suspense fallback={null}>
        <Dynamic />
      </Suspense>
    </>
  )
}

async function Dynamic() {
  await connection()
  return <p>dynamic content</p>
}

export function generateStaticParams() {
  return [{ slug: 'days' }, { slug: 'weeks' }]
}
