import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

// A request-time access gate behind Suspense. On the first visit (no
// "session" cookie) it calls redirect() while the rest of the page is
// already streaming, so Next emits the <meta id="__next-page-redirect">
// marker into the document. /landed then "recovers the session" (sets the
// cookie) and sends the user back here client-side.
async function Gate() {
  const store = await cookies()
  if (!store.get('session')) {
    redirect('/landed')
  }
  return null
}

async function Content() {
  const store = await cookies()
  return (
    <p data-testid="a-content">
      Request-time content for session: {store.get('session')?.value ?? 'none'}
    </p>
  )
}

export default function PageA() {
  return (
    <main>
      <h1>Route A</h1>
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
      <Suspense fallback={<p>loading…</p>}>
        <Content />
      </Suspense>
      <p>
        <Link href="/b">Go to B (plain)</Link>
      </p>
      <p>
        <Link href="/">Go home</Link>
      </p>
    </main>
  )
}
