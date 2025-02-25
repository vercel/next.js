import { unstable_expireTag, unstable_cacheTag as cacheTag } from 'next/cache'

async function refresh() {
  'use server'
  unstable_expireTag('home')
}

export default async function Page() {
  'use cache'
  cacheTag('home')

  return (
    <form action={refresh}>
      <button id="refresh">Refresh</button>
      <p id="t">{Date.now()}</p>
    </form>
  )
}
