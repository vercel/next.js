import { cacheLife } from 'next/cache'
import { Suspense } from 'react'
import { Form } from './form'
import { getActionCount } from './state'

async function CachedActionCount() {
  'use cache'

  cacheLife({ stale: 60, revalidate: 1, expire: 3600 })

  return (
    <p id="action-count" data-generated-at={Date.now()}>
      {getActionCount()}
    </p>
  )
}

export default async function Page() {
  return (
    <>
      <Form />
      <Suspense fallback={<p id="action-count">0</p>}>
        <CachedActionCount />
      </Suspense>
    </>
  )
}
