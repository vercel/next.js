import { connection } from 'next/server'
import { unstable_cache as cache } from 'next/cache'

export default async function Page() {
  await connection()
  return (
    <ul>
      <li>
        <RandomValue />
      </li>
      <li>
        <RandomValue />
      </li>
    </ul>
  )
}

async function RandomValue() {
  return getCachedRandom()
}

const getCachedRandom = cache(async () => {
  return Math.random()
})
