import { cacheLife, cacheTag } from 'next/cache'

import { theme } from '../../../variants'

// `r` exists only so the revalidation test has a prerender of its own to
// expire, leaving the entries the other tests read untouched.
export async function generateStaticParams() {
  return [{ slug: 'a' }, { slug: 'r' }]
}

export async function generateStaticVariants() {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

// The variant value is read outside the cache scope and passed in, which is the
// only way to get it in there: reading a variant inside `'use cache'` throws.
// The lifetime it selects differs per combination, so the two prerenders of
// this route should not share a revalidate period.
async function cachedByTheme(currentTheme: string, slug: string) {
  'use cache'

  // Tagged per param so a test can expire one param's prerenders on demand
  // rather than waiting out the route's lifetime, without disturbing the
  // entries another test depends on. The tag propagates to the prerender, so
  // invalidating it makes the next request revalidate, which is the path that
  // rebuilds the request for the origin and so the path a variant value has to
  // survive. Only a param that `generateStaticParams` covers is usable for
  // that: an on-demand param is still having its shell completed in the
  // background when the tag is expired, and that write lands afterwards, so the
  // entry ends up holding pre-invalidation content under a post-invalidation
  // timestamp.
  cacheTag(`lifetime-${slug}`)

  if (currentTheme === 'light') {
    cacheLife('minutes')
  } else {
    cacheLife('hours')
  }

  // Stamped inside the cache scope, so it changes only when this entry is
  // regenerated. That is what lets a test tell a revalidated response from a
  // stale one, which the variant value cannot do: it is the same either way.
  return { currentTheme, renderedAt: new Date().toISOString() }
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  // TODO: Allow this without parent Suspense if at least one theme was
  // prerendered.
  const currentTheme = await theme()
  const { slug } = await params
  const cached = await cachedByTheme(currentTheme, slug)

  return (
    <>
      <p id="theme">{cached.currentTheme}</p>
      <p id="rendered-at">{cached.renderedAt}</p>
    </>
  )
}
