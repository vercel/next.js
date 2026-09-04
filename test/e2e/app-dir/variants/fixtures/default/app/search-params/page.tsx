import { Suspense } from 'react'

import { theme } from '../../variants'

// Cache Components can place the `searchParams` read behind the boundary and
// produce an output for each combination. A legacy prerender cannot, so the
// route renders dynamically without a variants prefix in that mode.
export async function unstable_generateStaticVariants() {
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
      <Suspense fallback={<p id="theme">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <Suspense fallback={<p id="search-params">pending</p>}>
        <SearchParams searchParams={searchParams} />
      </Suspense>
    </>
  )
}
