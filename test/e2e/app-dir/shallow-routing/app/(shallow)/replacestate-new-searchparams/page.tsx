'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function InnerPage() {
  const searchParams = useSearchParams()
  return (
    <>
      <h1 id="replacestate-searchparams">ReplaceState SearchParams</h1>
      <pre id="my-data">{searchParams.get('query')}</pre>
      <button
        onClick={() => {
          const url = new URL(window.location.href)
          const previousQuery = url.searchParams.get('query')
          url.searchParams.set(
            'query',
            previousQuery ? previousQuery + '-added' : 'foo'
          )
          window.history.replaceState({}, '', url)
        }}
        id="replace-searchparams"
      >
        Replace searchParam
      </button>
    </>
  )
}

export default function Page() {
  return (
    <Suspense>
      <InnerPage />
    </Suspense>
  )
}
