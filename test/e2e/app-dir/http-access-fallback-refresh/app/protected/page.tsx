import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AccessToggle } from '../components/access-toggle'

async function ProtectedContent() {
  const cookieStore = await cookies()

  if (cookieStore.get('refresh-access')?.value !== 'granted') {
    notFound()
  }

  return (
    <main id="protected-content">
      <p>Protected content</p>
      <AccessToggle access="revoke" />
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p id="loading">Loading...</p>}>
      <ProtectedContent />
    </Suspense>
  )
}
