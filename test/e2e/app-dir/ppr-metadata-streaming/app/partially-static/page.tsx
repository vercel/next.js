import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function Dynamic() {
  await connection()

  return <p>Dynamic</p>
}

async function getCachedDate() {
  'use cache'

  cacheLife({ revalidate: 1, expire: 5 * 60 })

  return new Date().toISOString()
}

export default async function Page() {
  return (
    <div>
      <Suspense fallback={<p>Loading...</p>}>
        <Dynamic />
      </Suspense>
      <p id="date">{await getCachedDate()}</p>
    </div>
  )
}
