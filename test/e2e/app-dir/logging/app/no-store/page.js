import { unstable_noStore } from 'next/cache'

async function getUncachedRandomData() {
  unstable_noStore()
  const res = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?another-no-cache'
  )
  const data = await res.json()
  return data
}

export default async function Page() {
  const uncachedData = await getUncachedRandomData()
  console.log('uncachedData', uncachedData)
  return (
    <div>
      <p>random: {Math.random()}</p>
      <p id="uncached-data">uncachedData: {uncachedData}</p>
    </div>
  )
}
