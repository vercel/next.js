'use client'

import { useSearchParams } from 'next/navigation'

export default function IdPage({ children, params }) {
  return (
    <>
      <p>
        Id Page. Params:{' '}
        <span id="id-page-params">{JSON.stringify(params)}</span>
      </p>
      {children}

      <p id="search-params">
        {JSON.stringify(Object.fromEntries(useSearchParams()))}
      </p>
    </>
  )
}
