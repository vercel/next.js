import { Suspense } from 'react'

import { theme } from '../../variants'

// Declared so that a request to this route is prefixed with its combination,
// which is what puts the internal query parameter carrying the combination on
// the path the origin sees. The page reads `searchParams` so that anything left
// in that query becomes visible to user code.
export async function generateStaticVariants() {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

async function SearchParams({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolved = await searchParams

  return <p id="search-params">{Object.keys(resolved).sort().join(',')}</p>
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <>
      <p id="theme">{await theme()}</p>
      <Suspense fallback={<p id="search-params">pending</p>}>
        <SearchParams searchParams={searchParams} />
      </Suspense>
    </>
  )
}
