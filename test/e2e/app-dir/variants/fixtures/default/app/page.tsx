import { Suspense } from 'react'

import { theme } from '../variants'

// A variant is runtime data, and Cache Components requires a Suspense boundary
// above a read of one.
export default function Page() {
  return (
    <Suspense fallback={<p id="theme-pending">pending</p>}>
      <p id="theme">{theme()}</p>
    </Suspense>
  )
}
