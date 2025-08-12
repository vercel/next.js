import { unstable_noStore } from 'next/cache'
import { Suspense } from 'react'

export const experimental_ppr = true

function Dynamic() {
  unstable_noStore()
  return <div id="sentinel:dynamic">Dynamic</div>
}

export default function Page() {
  return (
    <Suspense fallback={<div id="sentinel:loading">Loading...</div>}>
      <Dynamic />
    </Suspense>
  )
}
