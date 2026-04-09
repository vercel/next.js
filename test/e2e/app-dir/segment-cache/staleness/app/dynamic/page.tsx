import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content() {
  await connection()
  return <div id="dynamic-content">Dynamic content</div>
}

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
