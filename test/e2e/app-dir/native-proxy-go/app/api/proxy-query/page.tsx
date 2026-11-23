import { Suspense } from 'react'

async function Query({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <pre id="query">{JSON.stringify(await searchParams)}</pre>
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback="Loading query">
      <Query searchParams={searchParams} />
    </Suspense>
  )
}
