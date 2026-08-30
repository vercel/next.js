import { Suspense } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

async function Gate() {
  const h = await headers()
  h.get('cookie')
  redirect('/redirect-result')
}

export default function RedirectSuspense() {
  return (
    <Suspense fallback={<p id="loading">loading…</p>}>
      <Gate />
    </Suspense>
  )
}
