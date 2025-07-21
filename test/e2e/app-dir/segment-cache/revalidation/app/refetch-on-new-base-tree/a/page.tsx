import { connection } from 'next/server'
import { Suspense } from 'react'
import { NoInline } from '../../../components/no-inline'

async function Content() {
  await connection()
  return <div id="page-a-content">Page A content</div>
}

export default async function PageA() {
  return (
    <Suspense fallback="Loading...">
      <NoInline />
      <Content />
    </Suspense>
  )
}
