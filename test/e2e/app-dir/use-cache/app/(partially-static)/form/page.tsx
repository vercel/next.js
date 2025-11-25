import { updateTag, cacheTag } from 'next/cache'

async function refresh() {
  'use server'
  updateTag('home')
}

export default async function Page() {
  'use cache'
  cacheTag('home')

  return (
    <form action={refresh}>
      <button id="refresh">Refresh</button>
      <p id="t">{new Date().toISOString()}</p>
    </form>
  )
}
