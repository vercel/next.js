import type { Instant } from 'next'
import { ClientChild } from './client'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [{ params: { slug: 'hello' } }],
}

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
