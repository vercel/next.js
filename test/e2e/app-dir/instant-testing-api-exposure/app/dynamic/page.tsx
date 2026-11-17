import { connection } from 'next/server'
import { Suspense } from 'react'

async function Content() {
  await connection()
  return <p>Request-time testing API exposure</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content />
    </Suspense>
  )
}
