import { Suspense } from 'react'
import { cookies } from 'next/headers'

// Reading a cookie makes the shell depend on session data, so a prefetch
// renders a runtime App Shell.
async function SessionData() {
  await cookies()
  return null
}

export default async function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html>
      <body>
        <Suspense fallback={<p id="cookie-loading">Loading cookie...</p>}>
          <SessionData />
        </Suspense>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
