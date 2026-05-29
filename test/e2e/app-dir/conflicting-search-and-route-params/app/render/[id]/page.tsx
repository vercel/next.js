import { Suspense } from 'react'

async function SearchAndRouteParams({
  searchParams,
  params,
}: {
  searchParams: Promise<{ id?: string }>
  params: Promise<{ id: string }>
}) {
  const { id: searchId } = await searchParams
  const { id: routeId } = await params

  return (
    <div>
      <h1>Search and Route Parameters</h1>
      <p id="route-param">Route param id: {routeId}</p>
      <p id="search-param">Search param id: {searchId || 'not provided'}</p>
    </div>
  )
}

export default function Page({
  searchParams,
  params,
}: {
  searchParams: Promise<{ id?: string }>
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchAndRouteParams searchParams={searchParams} params={params} />
    </Suspense>
  )
}
