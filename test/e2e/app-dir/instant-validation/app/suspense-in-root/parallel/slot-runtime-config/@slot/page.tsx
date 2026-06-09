import { Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_instant = { level: 'experimental-error' }
export const prefetch = 'allow-runtime'

export default function SlotPage() {
  return (
    <div>
      <p style={{ color: 'blue' }}>
        This is a parallel slot page with unstable_instant (runtime)
      </p>
      <Suspense
        fallback={<p style={{ color: 'blue' }}>Loading slot dynamic...</p>}
      >
        <SlotDynamic />
      </Suspense>
    </div>
  )
}

async function SlotDynamic() {
  await connection()
  return <p style={{ color: 'blue' }}>Slot dynamic content loaded</p>
}
