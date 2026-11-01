import { Suspense } from 'react'
import { cookies } from 'next/headers'

// The Speculative-phase counterpart of app/uses-cookies/page.tsx: the page
// reads cookies directly in the shell stage of every prerender, so the
// route tree prefetch never carries the static-prefetch hint. As a Partial
// Prefetching segment, the page requires runtime-completeness during the
// Speculative phase (which the consuming test enters via a `prefetch={true}`
// link), and with the hint unset the scheduler skips the static attempt
// entirely and issues the runtime prefetch directly.
// It also awaits searchParams so that a speculative prefetch has non-shell
// contents to resolve.
export const prefetch = 'partial'

type PageProps = {
  searchParams: Promise<SearchParams>
}

export default function Page(props: PageProps) {
  return (
    <main>
      <p id="page-content">Speculative-cookies page shell text</p>
      <Suspense
        fallback={
          <p id="speculative-cookie-loading">Loading speculative cookie...</p>
        }
      >
        <CookieContent {...props} />
      </Suspense>
    </main>
  )
}

async function CookieContent(props: PageProps) {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return (
    <>
      <div id="speculative-cookie-content">{`Speculative-cookies cookie: ${value}`}</div>
      <Suspense
        fallback={
          <p id="speculative-search-params-loading">Loading search params...</p>
        }
      >
        <SearchParamsContent {...props} />
      </Suspense>
    </>
  )
}

type SearchParams = Record<string, string | string[]>

async function SearchParamsContent(props: PageProps) {
  const searchCount = Object.keys(await props.searchParams).length
  return (
    <div id="search-params-content">{`Search params count: ${searchCount}`}</div>
  )
}
