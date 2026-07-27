'use client'
import { useRouter } from 'next/navigation'

export function UpdateSearchParamsButton({
  searchParams,
  id,
}: {
  searchParams: any
  id?: string
}) {
  const router = useRouter()

  return (
    <div>
      <div id={`search-params${id ? `-${id}` : ''}`}>
        Params: {JSON.stringify(searchParams.random)}
      </div>
      <button
        id={`update-search-params${id ? `-${id}` : ''}`}
        style={{ color: 'blue', padding: '10px' }}
        onClick={() => router.replace(`?random=${Math.random()}#hash-test`)}
      >
        Add Search Params
      </button>
    </div>
  )
}
