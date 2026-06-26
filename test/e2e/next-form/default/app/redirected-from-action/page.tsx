import * as React from 'react'
import { Suspense } from 'react'

type AnySearchParams = Promise<{
  [key: string]: string | Array<string> | undefined
}>

async function RedirectedPage({
  searchParams,
}: {
  searchParams: AnySearchParams
}) {
  const query = (await searchParams).query as string
  return <div id="redirected-results">query: {JSON.stringify(query)}</div>
}

export default function Page({
  searchParams,
}: {
  searchParams: AnySearchParams
}) {
  return (
    <Suspense fallback={<div>Page is loading...</div>}>
      <RedirectedPage searchParams={searchParams} />
    </Suspense>
  )
}
