'use client'
import { useSearchParams } from 'next/navigation'

export default function Page() {
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
    </>
  )
}
