import { Suspense } from 'react'
import { cookies } from 'next/headers'

// The hole reads a cookie. The refresh sends it; the stored document can't
// depend on it.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Cookies</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Flavor />
      </Suspense>
    </main>
  )
}

async function Flavor() {
  const flavor = (await cookies()).get('ppr-cdn-mode-flavor')?.value ?? 'none'
  return <p id="dynamic">Flavor: {flavor}</p>
}
