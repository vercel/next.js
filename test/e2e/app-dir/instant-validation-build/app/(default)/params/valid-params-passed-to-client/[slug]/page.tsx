import type { Instant } from 'next'
import { ClientChild } from './client'
import { Fragment, Suspense } from 'react'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: 'hello' } }],
}
export const prefetch = 'allow-runtime'

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <SuspenseInPartialPrefetching>
        <Inner params={params} />
      </SuspenseInPartialPrefetching>
    </main>
  )
}

async function Inner({ params }: { params: Promise<Record<string, string>> }) {
  return <ClientChild params={await params} />
}

const SuspenseInPartialPrefetching = process.env.__NEXT_PARTIAL_PREFETCHING
  ? Suspense
  : Fragment
