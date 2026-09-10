import { cookies } from 'next/headers'

import { theme } from '../../variants'

export async function unstable_generateStaticVariants() {
  return [[[theme, 'light']], [[theme, 'dark']]]
}

// The route reads a cookie with no boundary above it, and no combination bakes
// that value, so the prerender of each combination comes out empty as well as
// the one that omits the variants. Declaring combinations must not excuse the
// route from the diagnostic, which is the difference from `above-boundary`:
// there the value read above the boundary is a variant, so a combination bakes
// it and only the prerender omitting the variants is empty.
export default async function Page() {
  const store = await cookies()

  return <p id="theme">{store.get('theme')?.value ?? 'none'}</p>
}
