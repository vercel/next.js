import { Suspense } from 'react'
import { cookies } from 'next/headers'

// Reading a cookie makes the shell depend on session data, so a prefetch
// renders a runtime App Shell. This is what exercises the prospective/final
// runtime prerender where params are a hanging input in a cached page.
async function SessionData() {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return <p id="cookie-value">{`Cookie: ${value}`}</p>
}

export default async function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html>
      <body>
        <Suspense fallback={<p id="cookie-loading">Loading cookie...</p>}>
          <SessionData />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
