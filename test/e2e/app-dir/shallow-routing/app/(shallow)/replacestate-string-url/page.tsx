'use client'
import { useSearchParams } from 'next/navigation'

export default function Page() {
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
          const url = `${window.location.pathname}?query=${
            previousQuery ? previousQuery + '-added' : 'foo'
          }`

          window.history.replaceState({}, '', url)
        }}
        id="replace-string-url"
      >
        Replace searchParam using string url
      </button>
    </>
  )
}
