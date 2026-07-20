import { Suspense } from 'react'
import { cookies } from 'next/headers'

// Targeted by a <Link prefetch={false}>, so it's only ever requested by an
// actual navigation.
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
  return <p id="nav-target-dynamic">{`Nav target content: ${cookieValue}`}</p>
}
