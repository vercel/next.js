import type { Instant } from 'next'
import { cookies } from 'next/headers'
import { ClientChild } from './client'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      cookies: [{ name: 'testCookie', value: 'testValue' }],
    },
  ],
}
export const unstable_prefetch = 'runtime'

export default async function Page() {
  return (
    <main>
      <p>
        Passing the whole cookies object to the client is generally a bad idea,
        but it shouldn't crash validation, so we still do it
      </p>
      <ClientChild cookieStore={await cookies()} />
    </main>
  )
}
