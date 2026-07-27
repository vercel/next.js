import { cacheLife } from 'next/cache'

export default async function CacheLifeSecondsPage() {
  'use cache'
  cacheLife({ stale: 0, revalidate: 1, expire: 60 })

  const randomNumber = Math.random()

  return (
    <div id="cache-life-seconds-page">
      <p>Cache Life Seconds Page</p>
      <p id="random-value">{randomNumber}</p>
    </div>
  )
}
