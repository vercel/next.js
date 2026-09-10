import { Suspense } from 'react'

import { combinations } from '../../combinations'
import { locale, theme } from '../../variants'

// This route has no dynamic segments. Its combinations produce exact outputs,
// so they multiply prerenders without adding dynamic routing entries.
export function unstable_generateStaticVariants() {
  return combinations()
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p id="theme-pending">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <Suspense fallback={<p id="locale-pending">pending</p>}>
        <p id="locale">{locale()}</p>
      </Suspense>
    </>
  )
}
