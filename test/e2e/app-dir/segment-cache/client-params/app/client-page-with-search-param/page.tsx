'use client'

import { Suspense, use } from 'react'

function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParamsDict = use(searchParams)

  let query = null
  if (Object.keys(searchParamsDict).length > 0) {
    query = JSON.stringify(searchParamsDict)
  }

  return (
    <>
      <p id="query">Query: {query ? query : '(none)'}</p>
    </>
  )
}

export default function ClientPageWithSearchParam({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback="Loading...">
      <Content searchParams={searchParams} />
    </Suspense>
  )
}
