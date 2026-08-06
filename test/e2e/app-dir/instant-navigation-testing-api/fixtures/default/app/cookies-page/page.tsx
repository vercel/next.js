import { Suspense } from 'react'
import { cookies } from 'next/headers'

export default function CookiesPage() {
  return (
    <div>
      <h1 data-testid="cookies-page-title">Cookies Page</h1>
      <Suspense
        fallback={<div data-testid="cookies-fallback">Loading cookies...</div>}
      >
        <CookieContent />
      </Suspense>
    </div>
  )
}

async function CookieContent() {
  const cookieStore = await cookies()
  const testCookie = cookieStore.get('testCookie')

  return (
    <div data-testid="cookie-value">
      testCookie: {testCookie?.value ?? 'not set'}
    </div>
  )
}
