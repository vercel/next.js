import { Suspense } from 'react'
import { cookies } from 'next/headers'

// No Partial Prefetching opt-ins. Targeted by a <Link prefetch={true}>, which
// performs a legacy "full" dynamic prefetch.
export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? 'none'
  return <p id="legacy-dynamic">{`Legacy dynamic content: ${cookieValue}`}</p>
}
