import { Suspense } from 'react'
import { connection } from 'next/server'

async function Content() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div id="suspended-content">Suspended content</div>
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  )
}
