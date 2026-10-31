import { Suspense } from 'react'

export default async function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SyncIO />
    </Suspense>
  )
}

async function SyncIO() {
  const now = Date.now()
  return <code>{now}</code>
}
