import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife } from 'next/cache'

async function Shell({
  params,
  children,
}: {
  params: Promise<{ id: string }>
  children: React.ReactNode
}) {
  'use cache'
  cacheLife({ stale: 200, revalidate: 1800, expire: 43200 })
  const { id } = await params
  return (
    <div>
      <h1>{`Shell for ${id}`}</h1>
      <p>{new Date().toISOString()}</p>
      {children}
    </div>
  )
}

async function Dynamic() {
  const jar = await cookies()
  return <p>session: {jar.get('session')?.value ?? 'anon'}</p>
}

export async function generateStaticParams() {
  return [{ id: 'prerendered' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <Shell params={params}>
      <Suspense fallback={<p>loading…</p>}>
        <Dynamic />
      </Suspense>
    </Shell>
  )
}
