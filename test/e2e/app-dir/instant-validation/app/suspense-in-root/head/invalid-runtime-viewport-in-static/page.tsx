import type { Viewport } from 'next'
import { Suspense } from 'react'

type SearchParams = Record<string, string | string[]>

// This would be valid if it used a runtime prefetch (because then it wouldn't block navigation),
// but it's static, so it's invalid. As an extra sanity check, we put a runtime prefetch on the
// layout above, and that should not make this error go away.
export const instant = { level: 'experimental-error' }

export async function generateViewport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Viewport> {
  await searchParams
  return {
    themeColor: 'aliceblue',
  }
}

export default function Page({ searchParams }) {
  return (
    <main>
      <p>This page has a link-data generateViewport</p>
      <p>
        We also access link data in the page itself, because a fully static page
        with a link vieport is not allowed.
      </p>
      <Suspense>
        <LinkData searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function LinkData({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await searchParams
  return null
}
