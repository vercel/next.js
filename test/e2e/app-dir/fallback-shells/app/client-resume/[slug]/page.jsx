import { Suspense } from 'react'
import { ClientParams } from './client-params'

// Only a client component reads the param. A slug that wasn't prerendered gets
// the static fallback shell, which fetches its hydration data
// (`__NEXT_CLIENT_RESUME`) and fills the param in from the URL.
export default function Page() {
  return (
    <main>
      <h1 id="heading">Client resume</h1>
      <Suspense fallback={<p id="slug-fallback">Loading slug…</p>}>
        <ClientParams />
      </Suspense>
    </main>
  )
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
