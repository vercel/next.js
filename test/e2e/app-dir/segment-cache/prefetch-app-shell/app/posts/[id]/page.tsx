import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

type Params = { id: string }

export const prefetch = 'allow-runtime'

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      {/* Cookies are part of the request context, so they're available
          when the App Shell is prerendered. The result is included in
          the cached shell. */}
      <Suspense fallback={<p id="cookie-loading">Loading cookie...</p>}>
        <CookieDependent />
      </Suspense>
      {/* The fallback is the App Shell — the part of the page that
          doesn't depend on params. */}
      <Suspense fallback={<p id="shell">App shell for posts</p>}>
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}

async function CookieDependent() {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return <p id="cookie-value">{`Cookie: ${value}`}</p>
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  // The fallback shows while the dynamic content is loading, after the
  // params have resolved.
  return (
    <>
      <p id="param-value">{`Post ${id}`}</p>
      <Suspense
        fallback={<p id="dynamic-loading">Loading dynamic content...</p>}
      >
        <Dynamic id={id} />
      </Suspense>
    </>
  )
}

async function Dynamic({ id }: { id: string }) {
  await connection()
  return <p id="dynamic-content">{`Post body for ${id}`}</p>
}
