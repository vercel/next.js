import { connection } from 'next/server'
import { Suspense } from 'react'
import { getCachedDate } from '../cached-date'

async function DynamicDate() {
  await connection()

  return <p id="cached-date">{await getCachedDate()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <DynamicDate />
    </Suspense>
  )
}
