import { Suspense } from 'react'
import { connection } from 'next/server'
import SharedPage from '../../shared-page'

async function CachedContent() {
  'use cache: remote'
  return <SharedPage isDynamic={true} />
}

async function Content() {
  await connection()
  return <CachedContent />
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Content />
    </Suspense>
  )
}
