import { cacheLife } from 'next/cache'

import { theme } from '../../../variants'

export async function generateStaticParams() {
  return [{ slug: 'a' }]
}

// TODO: Generate a fallback shell where all variants used on the page are
// hanging promises.
export async function generateStaticVariants() {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

// The variant value is read outside the cache scope and passed in, which is the
// only way to get it in there: reading a variant inside `'use cache'` throws.
// The lifetime it selects differs per combination, so the two prerenders of
// this route should not share a revalidate period.
async function cachedByTheme(currentTheme: string) {
  'use cache'

  if (currentTheme === 'light') {
    cacheLife('minutes')
  } else {
    cacheLife('hours')
  }

  return currentTheme
}

export default async function Page() {
  // TODO: Allow this without parent Suspense if at least one theme was
  // prerendered.
  const currentTheme = await theme()

  return <p id="theme">{await cachedByTheme(currentTheme)}</p>
}
