import { Suspense } from 'react'

import { combinations } from '../../../combinations'
import { locale, theme } from '../../../variants'

export async function generateStaticParams() {
  return [{ slug: 'a' }]
}

// A dynamic route is the case that carries the routing entries under test. It
// contributes a prefetch segment route, and that route is derived from the route
// pattern, so it is the same route for every combination.
export async function generateStaticVariants() {
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
