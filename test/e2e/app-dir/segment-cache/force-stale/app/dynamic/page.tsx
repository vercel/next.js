import { connection } from 'next/server'
import { Suspense } from 'react'

async function PageContent() {
  await connection()
  return <div id="dynamic-page-content">Dynamic page content</div>
}

export default async function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PageContent />
    </Suspense>
  )
}
