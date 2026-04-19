import type { Instant } from 'next'
import { ClientChild } from './client'

export const unstable_instant: Instant = {
  samples: [{ params: { slug: 'hello' } }],
}
export const unstable_prefetch = 'force-runtime'

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
