import { connection } from 'next/server'
import { Suspense } from 'react'

async function Content() {
  await connection()
  return <div id="page-a-content">Page A content</div>
}

export default async function PageA() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
