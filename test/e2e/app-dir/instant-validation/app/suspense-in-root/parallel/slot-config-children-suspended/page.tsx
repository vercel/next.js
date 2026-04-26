import { Suspense } from 'react'
import { cookies } from 'next/headers'

export default function Page() {
  return (
    <main>
      <p>This is the children page with cookies() properly inside Suspense</p>
      <Suspense fallback={<p>Loading dynamic content...</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}

async function DynamicContent() {
  await cookies()
  return <p>Dynamic content loaded</p>
}
