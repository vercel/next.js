import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content() {
  await connection()
  return <div id="hub-b">Hub B</div>
}

export default function Page() {
  return (
    <Suspense fallback="Loading hub B...">
      <Content />
    </Suspense>
  )
}
