'use client'

import { useSearchParams } from 'next/navigation'

export default function Page() {
  const params = useSearchParams()

  return (
    <>
      <h1
        id="params"
        data-param-first={params.get('first') ?? 'N/A'}
        data-param-second={params.get('second') ?? 'N/A'}
        data-param-third={params.get('third') ?? 'N/A'}
        data-param-not-real={params.get('notReal') ?? 'N/A'}
      >
        hello from /hooks/use-search-params
      </h1>
    </>
  )
}
