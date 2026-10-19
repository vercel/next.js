import { Suspense } from 'react'
import { connection } from 'next/server'
import { SearchBox } from './search-box'

// Dynamic via connection() (works in plain and Cache Components builds; unlike
// `export const dynamic`, which Cache Components rejects). A search-param nav is
// then a SearchParamOnlyChange, which is what allocates a scroll target.
async function Dynamic() {
  await connection()
  return <SearchBox testId="search-input" />
}

export default function Page() {
  return (
    <>
      <Suspense>
        <Dynamic />
      </Suspense>
      {/* Tall enough to scroll, so the scroll-to-top assertion is meaningful. */}
      <div data-testid="spacer" style={{ height: 3000 }} />
    </>
  )
}
