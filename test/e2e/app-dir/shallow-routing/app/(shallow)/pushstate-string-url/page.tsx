'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function InnerPage() {
  const searchParams = useSearchParams()
  return (
    <>
      <h1 id="pushstate-string-url">PushState String Url</h1>
      <pre id="my-data">{searchParams.get('query')}</pre>
      <button
        onClick={() => {
          const previousQuery = new URL(window.location.href).searchParams.get(
            'query'
          )
          const url = `?query=${
            previousQuery ? previousQuery + '-added' : 'foo'
          }`

          window.history.pushState({}, '', url)
        }}
        id="push-string-url"
      >
        Push searchParam using string url
      </button>

      <button
        onClick={() => {
          const previousQuery = new URL(window.location.href).searchParams.get(
            'query'
          )
          const url = `?query=${
            previousQuery ? previousQuery + '-added' : 'foo'
          }`

          window.history.pushState(null, '', url)
        }}
        id="push-string-url-null"
      >
        Push searchParam with null data param
      </button>

      <button
        onClick={() => {
          const previousQuery = new URL(window.location.href).searchParams.get(
            'query'
          )
          const url = `?query=${
            previousQuery ? previousQuery + '-added' : 'foo'
          }`

          window.history.replaceState(undefined, '', url)
        }}
        id="push-string-url-undefined"
      >
        Push searchParam with undefined data param
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
