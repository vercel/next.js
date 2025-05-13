import Link from 'next/link'
import React from 'react'
import { Suspense } from 'react'
import { SearchParamsAccess } from './[slug]/search-params-access'

export default function Home() {
  return (
    <>
      <Suspense>
        <p>
          This search params access should not make the page partially static.
        </p>
        <SearchParamsAccess />
      </Suspense>
      <p>
        <Link href="/prerendered?foo=1">Go to /prerendered</Link>
      </p>
      <p>
        <Link href="/not-prerendered?foo=2">Go to /not-prerendered</Link>
      </p>
    </>
  )
}
