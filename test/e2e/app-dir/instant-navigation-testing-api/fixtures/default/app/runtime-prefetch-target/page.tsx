import { Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ searchParams: { myParam: 'testValue' } }],
}

type SearchParams = { [key: string]: string | string[] | undefined }

export default async function RuntimePrefetchTargetPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <div>
      <h1>Runtime Prefetch Target</h1>
      <Suspense fallback={<div data-testid="outer-loading">Loading...</div>}>
        <RuntimePrefetchableContent searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={
          <div data-testid="inner-loading">Loading dynamic content...</div>
        }
      >
        <DynamicContent />
      </Suspense>
    </div>
  )
}

async function RuntimePrefetchableContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const myParam = params.myParam

  return <p data-testid="search-param-value">{`myParam: ${myParam}`}</p>
}

async function DynamicContent() {
  await connection()

  return <div data-testid="dynamic-content">Dynamic content loaded</div>
}
