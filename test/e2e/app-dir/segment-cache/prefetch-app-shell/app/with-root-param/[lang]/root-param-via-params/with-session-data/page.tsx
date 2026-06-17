import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const prefetch = 'allow-runtime'

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  // All params at this level are root params, so we should be able
  // to access them without blocking the app shell.
  const { lang } = await params
  return (
    <>
      {/* Cookies are part of the request context, so they're available
          when the App Shell is prerendered. The result is included in
          the cached shell. */}
      <Suspense fallback={<p id="cookie-loading">Loading cookie...</p>}>
        <CookieDependent />
      </Suspense>
      {/* The fallback is the App Shell — the part of the page that
          doesn't depend on non-root params. */}
      <Suspense
        fallback={
          <p id="shell">{`App shell for page with root param: ${lang}`}</p>
        }
      >
        <Dynamic />
      </Suspense>
    </>
  )
}

async function CookieDependent() {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return <p id="cookie-value">{`Cookie: ${value}`}</p>
}

async function Dynamic() {
  await connection()
  return <p id="dynamic-content">Dynamic content</p>
}
