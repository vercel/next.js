import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

async function Hang() {
  await new Promise(() => {})
  return null
}

export default function Page() {
  return (
    <Suspense fallback={<p>stream-started</p>}>
      <Hang />
    </Suspense>
  )
}
