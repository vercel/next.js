import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function DynamicNotFound() {
  const cookieStore = await cookies()
  const marker = cookieStore.get('not-found-marker')?.value ?? 'missing'

  return <p id="dynamic-not-found">{marker}</p>
}

export default function NotFound() {
  return (
    <main>
      <h1>App Router not found</h1>
      <Suspense fallback={<p>Loading not-found content...</p>}>
        <DynamicNotFound />
      </Suspense>
    </main>
  )
}
