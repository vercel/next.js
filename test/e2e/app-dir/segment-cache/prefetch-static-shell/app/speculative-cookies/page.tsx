import { Suspense } from 'react'
import { cookies } from 'next/headers'

// The Speculative-phase counterpart of app/uses-cookies/page.tsx: the page
// reads cookies directly in the shell stage of every prerender, so the
// route tree prefetch never carries the static-prefetch hint. As a Partial
// Prefetching segment, the page requires runtime-completeness during the
// Speculative phase (which the consuming test enters via a `prefetch={true}`
// link), and with the hint unset the scheduler skips the static attempt
// entirely and issues the runtime prefetch directly. Unlike the uses-cookies
// fixture, the Speculative runtime prefetch RESOLVES the cookies() read, so
// the cookie-derived content itself arrives in the runtime response.
export const prefetch = 'partial'

async function CookieContent() {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return (
    <div id="speculative-cookie-content">{`Speculative-cookies cookie: ${value}`}</div>
  )
}

export default function Page() {
  return (
    <main>
      <p id="page-content">Speculative-cookies page shell text</p>
      <Suspense
        fallback={
          <p id="speculative-cookie-loading">Loading speculative cookie...</p>
        }
      >
        <CookieContent />
      </Suspense>
    </main>
  )
}
