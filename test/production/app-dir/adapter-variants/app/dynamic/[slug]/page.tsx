import { Suspense } from 'react'

import { combinations } from '../../../combinations'
import { locale, theme } from '../../../variants'

export function generateStaticParams() {
  return [{ slug: 'a' }]
}

// This route contributes the dynamic routing entries under test. Their matcher
// captures any combination hash, so the entries must not multiply with the
// number of combinations.
export function unstable_generateStaticVariants() {
  return combinations()
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <>
      <Suspense fallback={<p id="theme-pending">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <Suspense fallback={<p id="locale-pending">pending</p>}>
        <p id="locale">{locale()}</p>
      </Suspense>
      <p id="slug">{slug}</p>
    </>
  )
}
