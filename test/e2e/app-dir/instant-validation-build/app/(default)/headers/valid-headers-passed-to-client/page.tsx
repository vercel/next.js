import type { Instant } from 'next'
import { headers } from 'next/headers'
import { ClientChild } from './client'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      headers: [['x-test-header', 'testValue']],
    },
  ],
}
export const unstable_prefetch = 'runtime'

export default async function Page() {
  return (
    <main>
      <p>
        Passing the whole headers object to the client is generally a bad idea,
        but it shouldn't crash validation, so we still do it
      </p>
      <ClientChild headerStore={await headers()} />
    </main>
  )
}
