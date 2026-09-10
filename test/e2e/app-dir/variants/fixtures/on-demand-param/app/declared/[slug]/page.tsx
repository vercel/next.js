import { Suspense } from 'react'

import { getCachedSentinelValue } from '../../sentinel'
import { theme } from '../../../variants'

export async function generateStaticParams() {
  return [{ slug: 'built' }]
}

export async function generateStaticVariants() {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

// The param is read above every boundary, so the fallback shell of every
// combination is empty and there is nothing to serve while the param resolves.
// A param the build never named therefore has to be prerendered by the request
// that asks for it, and that prerender belongs to the combination the request
// resolved.
//
// The variant sits behind a boundary, which every route that reads one needs:
// the prerender that omits the variants has to leave a hole somewhere, and a
// read above every boundary leaves it nothing to prerender at all. A
// combination bakes the value, so the boundary is transparent there and the
// value is in the document.
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <>
      <p id="slug">{slug}</p>
      <Suspense fallback={<p id="theme-pending">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <p id="cached-sentinel">{await getCachedSentinelValue()}</p>
    </>
  )
}
