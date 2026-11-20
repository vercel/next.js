import { Suspense } from 'react'
import { connection } from 'next/server'

// connection() makes the page dynamic in all modes, so navigating here
// always produces a router request.
async function Content() {
  await connection()
  return <div id="dest">Destination page</div>
}

export default function DestPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  )
}
