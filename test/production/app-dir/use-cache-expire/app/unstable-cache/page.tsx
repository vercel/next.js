import { cacheLife, unstable_cache } from 'next/cache'
import { setTimeout } from 'timers/promises'

const getValue = unstable_cache(
  async () => {
    await setTimeout(100)
    return new Date().toISOString()
  },
  ['unstable-cache-value'],
  { revalidate: 60 }
)

async function Expire() {
  'use cache'
  cacheLife({ revalidate: 60, expire: 300 })
  return null
}

export default async function Page() {
  return (
    <>
      <Expire />
      <p id="value">{await getValue()}</p>
    </>
  )
}
