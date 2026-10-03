import { Suspense } from 'react'
import { connection } from 'next/server'
import { fetchRandomWithForceCache, RDCInfo } from '../../../utils'

export function createFetchCacheRevalidationPage(id: string) {
  async function DynamicComponent() {
    await connection()
    return null
  }

  const CACHE_TAG = `test-fetch-cache-revalidation-${id}`

  async function getRandomNumber() {
    const res = await fetchRandomWithForceCache({ tag: CACHE_TAG })
    const dateHeader = res.headers.get('date')
    const timestamp = dateHeader
      ? new Date(dateHeader).getTime()
      : 'time_unknown'
    const text = await res.text()
    return `fetch-random-${timestamp}-${text}`
  }

  return async function Page() {
    const randomNumber = await getRandomNumber()
    return (
      <main>
        <h1>{`fetch cache revalidation - ${id}`}</h1>
        {process.env.SHOW_RDC_INFO && <RDCInfo />}
        <p id="random-number">{randomNumber}</p>
        <Suspense>
          <DynamicComponent />
        </Suspense>
      </main>
    )
  }
}
