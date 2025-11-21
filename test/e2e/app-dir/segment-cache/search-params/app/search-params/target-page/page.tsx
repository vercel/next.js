import { Suspense } from 'react'

async function Content({ searchParams }) {
  const { searchParam } = await searchParams
  return `Search param: ${searchParam}`
}

export default async function Target({ searchParams }) {
  return (
    <Suspense fallback="Loading...">
      <div id="target-page-with-search-param">
        <Content searchParams={searchParams} />
      </div>
    </Suspense>
  )
}
