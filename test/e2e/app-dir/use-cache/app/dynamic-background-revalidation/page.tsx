import { unstable_cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getCachedData() {
  'use cache'
  unstable_cacheLife({ revalidate: 3, expire: Infinity })
  await setTimeout(2000)

  return new Date().toISOString()
}

export default async function DynamicPage() {
  await connection()

  return <p>{await getCachedData()}</p>
}
