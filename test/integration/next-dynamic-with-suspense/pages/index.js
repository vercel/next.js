import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const Thing = dynamic(() => import('./thing'), {
  ssr: false,
  suspense: true,
  loading: () => 'Loading...',
})

export default function IndexPage() {
  return (
    <div>
      <p>Next.js Example</p>
      <Suspense fallback="Loading...">
        <Thing />
      </Suspense>
    </div>
  )
}
