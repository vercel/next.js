import { Suspense } from 'react'
import { connection } from 'next/server'
import { fetchRandomWithForceCache } from '../../../utils'

async function DynamicComponent() {
  await connection()
  return null
}

const CACHE_TAG = 'test-fetch-cache-revalidation'

async function getRandomNumber() {
  const res = await fetchRandomWithForceCache({ tag: CACHE_TAG })
  const dateHeader = res.headers.get('date')
  const timestamp = dateHeader ? new Date(dateHeader).getTime() : 'time_unknown'
  const text = await res.text()
  return `fetch-random-${timestamp}-${text}`
}

export default async function Page() {
  const randomNumber = await getRandomNumber()
  return (
    <main>
      <p id="random-number">{randomNumber}</p>
      <Suspense>
        <DynamicComponent />
      </Suspense>
    </main>
  )
}
