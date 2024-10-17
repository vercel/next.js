import { unstable_cacheTag as cacheTag } from 'next/cache'

async function getCachedWithTag(tag) {
  'use cache'
  cacheTag(tag, 'c')
  return Math.random()
}

export default async function Page() {
  const x = await getCachedWithTag('a')
  const y = await getCachedWithTag('b')
  return (
    <p>
      {x}
      {y}
    </p>
  )
}
