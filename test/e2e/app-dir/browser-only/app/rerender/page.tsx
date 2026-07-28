import { Suspense } from 'react'
import { Rerender } from './rerender'

export default function Page() {
  return (
    <Suspense fallback={<p id="rerender-fallback">rerender fallback</p>}>
      <Rerender />
    </Suspense>
  )
}
