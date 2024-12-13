import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content() {
  await connection()
  return 'Dynamic Content'
}

export default function PPRDisabled() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
