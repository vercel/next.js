import { cookies } from 'next/headers'

// A blocking route with a `generateStaticParams`-covered param. The page awaits
// `params` BEFORE reading `cookies()`. In the app-shell prefetch ('3') all
// params are withheld (app shells carry session data like cookies, but no
// params — not even static ones), so `await params` suspends here and the
// `cookies()` read is never reached — keeping the cookie value OUT of the app
// shell. (A cookie-only route with no preceding param access would instead
// include the cookie in the app shell, since cookies are allowed there — that
// would not be the blocking behavior we want to assert.)
//
// `cookies()` is still read outside any <Suspense>, so the route has no static
// shell and remains request-time blocking. It fails `next build`'s static-shell
// validation, which is why it lives in this dev-only fixture. Under instant()
// the cookie value must NOT commit while the lock is held; it only streams in
// after the lock releases.
export function generateStaticParams() {
  return [{ id: 'x' }]
}

export default async function BlockingCookiesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await params
  const cookieStore = await cookies()
  const testCookie = cookieStore.get('testCookie')

  return (
    <div data-testid="blocking-cookie-value">
      testCookie: {testCookie?.value ?? 'not set'}
    </div>
  )
}
