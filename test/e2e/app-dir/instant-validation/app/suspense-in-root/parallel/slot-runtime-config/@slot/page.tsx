import { Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}
export const unstable_prefetch = 'runtime'

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
