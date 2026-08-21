import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { getDate } from '../logic'

async function DynamicCache({ id }: { id: string }) {
  'use cache: remote'
  cacheLife('days')
  return <span id="data">{getDate()}</span>
}

export default function Page() {
  return (
    <main>
      <Suspense>
        <DynamicCache id="dynamic-cache" />
      </Suspense>
    </main>
  )
}
