import { Suspense } from 'react'

type SearchParams = { [key: string]: string | string[] | undefined }

export default function SearchParamsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <div>
      <h1 data-testid="search-params-title">Search Params Page</h1>
      <Suspense
        fallback={
          <div data-testid="search-params-fallback">
            Loading search params...
          </div>
        }
      >
        <SearchParamContent searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function SearchParamContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const foo = params.foo

  return <div data-testid="search-param-content">foo: {foo ?? 'not set'}</div>
}
