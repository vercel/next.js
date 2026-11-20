import { cacheLife } from 'next/cache'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function getCachedValue(profile: string) {
  'use cache'

  if (profile === 'days') {
    cacheLife('days')
  } else if (profile === 'weeks') {
    cacheLife('weeks')
  } else {
    notFound()
  }

  return Math.random()
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  )
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
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
