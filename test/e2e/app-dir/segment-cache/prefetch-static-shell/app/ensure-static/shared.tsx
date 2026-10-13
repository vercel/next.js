import { cookies } from 'next/headers'
import { Suspense } from 'react'

export function Page() {
  return (
    <main>
      <p id="page-content">Cookies page shell text</p>
      <Suspense fallback={<p id="cookie-loading">Loading cookie...</p>}>
        <CookieContent />
      </Suspense>
    </main>
  )
}

async function CookieContent() {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return <div id="cookie-content">{`Cookie value: ${value}`}</div>
}
