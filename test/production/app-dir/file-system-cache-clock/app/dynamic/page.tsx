import { Suspense } from 'react'
import { connection } from 'next/server'
import { getData } from '../../lib/data'

async function Data() {
  // Rendered per request, so every request reads the fetch cache.
  await connection()
  return <p id="data">{await getData('dynamic')}</p>
}

export default function Page() {
  return (
    <Suspense>
      <Data />
    </Suspense>
  )
}
