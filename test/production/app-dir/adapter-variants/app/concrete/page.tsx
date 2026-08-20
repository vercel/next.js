import { Suspense } from 'react'

import { combinations } from '../../combinations'
import { locale, theme } from '../../variants'

// A route without dynamic segments. It contributes one prefix-translation entry
// for the whole route rather than one per combination, so it is the other half
// of the count the test pins.
export async function generateStaticVariants() {
  return combinations()
}

export default async function Page() {
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
