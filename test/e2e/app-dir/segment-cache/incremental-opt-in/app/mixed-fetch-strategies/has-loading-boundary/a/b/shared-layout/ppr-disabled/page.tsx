import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content() {
  await connection()
  return <div id="page-content">Dynamic page content</div>
}

export default async function Page() {
  return (
    <Suspense fallback={<div id="page-loading-boundary">Loading page...</div>}>
      <Content />
    </Suspense>
  )
}
