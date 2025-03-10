import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content() {
  await connection()
  return <div id="page-content">Page content</div>
}

export default function PPRDisabled() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
