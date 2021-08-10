import { Suspense } from 'react'
import Bar from './bar'

export default function Index() {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  return (
    <div>
      <p>Hello</p>
      <Suspense fallback={'loading...'}>
        <Bar />
      </Suspense>
    </div>
  )
}
