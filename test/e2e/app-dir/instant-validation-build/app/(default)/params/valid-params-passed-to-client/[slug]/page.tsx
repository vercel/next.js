import type { Instant } from 'next'
import { ClientChild } from './client'

export const unstable_instant: Instant = {
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
      <ClientChild params={await params} />
    </main>
  )
}
