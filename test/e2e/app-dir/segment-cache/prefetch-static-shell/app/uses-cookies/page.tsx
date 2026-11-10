import { Suspense } from 'react'
import { cookies } from 'next/headers'

// A page that reads cookies directly in the shell: every prerender records a
// runtime-data access during its shell stage, so the route tree prefetch
// never carries the static-prefetch hint. The client should go straight to a
// runtime shell prefetch without attempting a static one.

async function CookieContent() {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return <div id="cookie-content">{`Cookie value: ${value}`}</div>
}

export default function Page() {
  return (
    <main>
      <p id="page-content">Cookies page shell text</p>
      <Suspense fallback={<p id="cookie-loading">Loading cookie...</p>}>
        <CookieContent />
      </Suspense>
    </main>
  )
}
