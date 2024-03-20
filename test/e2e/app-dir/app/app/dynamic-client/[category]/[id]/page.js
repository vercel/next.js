'use client'

import { useSearchParams } from 'next/navigation'

export default function IdPage({ params }) {
  return (
    <>
      <p>
        Id Page. Params:{' '}
        <span id="id-page-params">{JSON.stringify(params)}</span>
      </p>

      <p id="search-params">
        {JSON.stringify(Object.fromEntries(useSearchParams()))}
      </p>
    </>
  )
}
