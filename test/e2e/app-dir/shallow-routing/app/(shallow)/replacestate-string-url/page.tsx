'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function InnerPage() {
  const searchParams = useSearchParams()
  return (
    <>
      <h1 id="replacestate-string-url">ReplaceState String Url</h1>
      <pre id="my-data">{searchParams.get('query')}</pre>
      <button
        onClick={() => {
          const previousQuery = new URL(window.location.href).searchParams.get(
            'query'
          )
          const url = `?query=${
            previousQuery ? previousQuery + '-added' : 'foo'
          }`

          window.history.replaceState({}, '', url)
        }}
        id="replace-string-url"
      >
        Replace searchParam using string url
      </button>

      <button
        onClick={() => {
          const previousQuery = new URL(window.location.href).searchParams.get(
            'query'
          )
          const url = `?query=${
            previousQuery ? previousQuery + '-added' : 'foo'
          }`

          window.history.replaceState(null, '', url)
        }}
        id="replace-string-url-null"
      >
        Replace searchParam with null data param
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
        id="replace-string-url-undefined"
      >
        Replace searchParam with undefined data param
      </button>

      <button
        onClick={() => {
          const previousQuery = new URL(window.location.href).searchParams.get(
            'query'
          )
          const url = `?query=${
            previousQuery ? previousQuery + '-added' : 'foo'
          }`

          // Forwarding the current state keeps the app router's own `__NA`
          // marker in the data passed to replaceState.
          window.history.replaceState(window.history.state, '', url)
        }}
        id="replace-string-url-current-state"
      >
        Replace searchParam forwarding the current history state
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
