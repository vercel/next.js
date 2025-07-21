import { connection } from 'next/server'
import { Suspense } from 'react'
import { NoInline } from '../../../components/no-inline'

async function Content() {
  await connection()
  return <div id="page-b-content">Page B content</div>
}

export default async function PageB() {
  return (
    <Suspense fallback="Loading...">
      <NoInline />
      <Content />
    </Suspense>
  )
}
