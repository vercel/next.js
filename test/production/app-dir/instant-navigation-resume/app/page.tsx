import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  return <p id="dynamic">dynamic content</p>
}

export default function Page() {
  return (
    <main>
      <p id="shell">static shell</p>
      <Suspense fallback={<p id="fallback">loading</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}
