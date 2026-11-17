import { cookies } from 'next/headers'
import { Suspense } from 'react'

async function CookieState() {
  const store = await cookies()
  return (
    <p id="cookie-state">
      {JSON.stringify({
        first: store.get('first')?.value ?? null,
        second: store.get('second')?.value ?? null,
        expiring: store.get('expiring')?.value ?? null,
        untouched: store.get('untouched')?.value ?? null,
      })}
    </p>
  )
}

export default function Page() {
  return (
    <Suspense fallback="Loading cookies">
      <CookieState />
    </Suspense>
  )
}
