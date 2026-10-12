import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SyncIO />
    </Suspense>
  )
}

function SyncIO() {
  const now = Date.now()
  return <code>{now}</code>
}
