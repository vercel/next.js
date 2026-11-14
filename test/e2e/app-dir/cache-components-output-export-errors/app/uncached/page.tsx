import { setTimeout } from 'node:timers/promises'
import { Suspense } from 'react'

async function Content() {
  await setTimeout(0)
  return <p>Uncached server data</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  )
}
