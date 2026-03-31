import { cacheLife } from 'next/cache'

async function getCachedRandom() {
  'use cache'
  cacheLife('frequent')
  return Math.random()
}

export default async function Page() {
  const x = await getCachedRandom()
  return <p id="x">{x}</p>
}
