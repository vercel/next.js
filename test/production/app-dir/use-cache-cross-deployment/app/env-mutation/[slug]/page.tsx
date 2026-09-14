import { cacheLife } from 'next/cache'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { MutateEnv } from './mutate-env'

export const prefetch = 'partial'

async function CachedValue({ slug }: { slug: string }) {
  'use cache'
  cacheLife('days')

  const value = process.env.MUTATED_DURING_CACHE_GENERATION ?? 'unset'

  return (
    <>
      <p id="data">{`${slug}:${value}`}</p>
      <MutateEnv />
    </>
  )
}

async function Content({ slug }: { slug: string }) {
  if (slug === 'known') {
    await cookies()
  }

  return <CachedValue slug={slug} />
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <Suspense>
      <Content slug={slug} />
    </Suspense>
  )
}

export function generateStaticParams() {
  return [{ slug: 'known' }]
}
