import { Suspense } from 'react'

async function ServerComponent() {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <div>RSC component loaded</div>
}

export default function RSCPage() {
  return (
    <div>
      <h1>React Server Component Page</h1>
      <p>This page includes RSC streaming to test RSC performance marks.</p>
      <Suspense fallback={<div>Loading RSC...</div>}>
        <ServerComponent />
      </Suspense>
    </div>
  )
}
