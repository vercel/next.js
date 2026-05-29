import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content() {
  await connection()
  return 'Dynamic page'
}

export default function DynamicPage() {
  return (
    <div id="dynamic-page">
      <Suspense fallback="Loading...">
        <Content />
      </Suspense>
    </div>
  )
}
