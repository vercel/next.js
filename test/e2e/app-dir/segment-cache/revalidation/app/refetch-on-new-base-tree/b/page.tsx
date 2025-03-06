import { connection } from 'next/server'
import { Suspense } from 'react'

async function Content() {
  await connection()
  return <div id="page-b-content">Page B content</div>
}

export default async function PageB() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
