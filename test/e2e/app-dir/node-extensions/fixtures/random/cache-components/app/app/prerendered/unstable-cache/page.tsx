import { unstable_cache as cache } from 'next/cache'

export default async function Page() {
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
