import { unstable_noStore } from 'next/cache'
import { Suspense } from 'react'

function Dynamic() {
  unstable_noStore()
  return <div>Dynamic</div>
}

export default function Page() {
  return (
    <div>
      <Suspense fallback={<div>Fallback</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}
