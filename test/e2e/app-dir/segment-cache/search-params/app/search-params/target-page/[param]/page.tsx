import { Suspense } from 'react'

async function SearchParam({ searchParams }) {
  const { searchParam } = await searchParams
  return `Search param: ${searchParam}`
}

async function Param({ params }) {
  const { param } = await params
  return `Param: ${param}`
}

export default async function Target({ params, searchParams }) {
  return (
    <>
      <Suspense fallback="Loading...">
        <div id="target-page-with-param">
          <Param params={params} />
        </div>
      </Suspense>
      <Suspense fallback="Loading...">
        <div id="target-page-with-search-param">
          <SearchParam searchParams={searchParams} />
        </div>
      </Suspense>
    </>
  )
}
