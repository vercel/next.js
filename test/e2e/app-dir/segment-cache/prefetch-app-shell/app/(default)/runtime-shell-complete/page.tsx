import { Suspense } from 'react'
import { cookies } from 'next/headers'

export const prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="cookie-loading">Loading cookie...</p>}>
        <CookieDependent />
      </Suspense>
    </main>
  )
}

async function CookieDependent() {
  const cookieStore = await cookies()
  const value = cookieStore.get('testCookie')?.value ?? 'none'
  return <p id="cookie-value">{`Cookie: ${value}`}</p>
}
