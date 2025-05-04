import React from 'react'
import { unstable_cache } from 'next/cache'

export default async function Page() {
  const cachedFn = unstable_cache(
    async () => {
      return Date.now()
    },
    ['date'],
    { revalidate: false }
  )

  const time = await cachedFn()

  return (
    <>
      <h1>Simple ISR with unstable_cache</h1>
      <p>
        Cached Time: <em id="data">{time}</em>
        Random: <em id="rand">{Math.random()}</em>
      </p>
    </>
  )
}
