import { Suspense } from 'react'
import { cookies } from 'next/headers'

// Same shape as `cookies-page` (cookies read inside a <Suspense>), but the
// component awaits a `generateStaticParams`-covered `params` BEFORE reading
// `cookies()`. The app-shell prefetch withholds all params, so it suspends at
// `await params` and never reaches the cookie read — keeping the cookie value
// OUT of the instant shell. Contrast with `cookies-page`, where the cookie (a
// session value carried by the app shell) appears in the instant shell because
// nothing gates it.
export function generateStaticParams() {
  return [{ id: 'x' }]
}

export default function CookiesWithParamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <div>
      <h1 data-testid="cookies-param-title">Cookies With Param Page</h1>
      <Suspense
        fallback={
          <div data-testid="cookies-param-fallback">Loading cookies...</div>
        }
      >
        <CookieContent params={params} />
      </Suspense>
    </div>
  )
}

async function CookieContent({ params }: { params: Promise<{ id: string }> }) {
  await params
  const cookieStore = await cookies()
  const testCookie = cookieStore.get('testCookie')

  return (
    <div data-testid="cookies-param-value">
      testCookie: {testCookie?.value ?? 'not set'}
    </div>
  )
}
