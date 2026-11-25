import { Suspense } from 'react'
import { connection } from 'next/server'
import { fetchRandomWithForceCache } from '../../../utils'

async function DynamicComponent() {
  await connection()
  return null
}

const KEY = 'test-fetch-cache-initial'

async function getRandomNumber() {
  const res = await fetchRandomWithForceCache({
    key: KEY,
    // no tag - this entry is not meant to be revalidated
    tag: undefined,
  })
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
