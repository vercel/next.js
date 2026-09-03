'use variants'

import { unstable_variant } from 'next/variants'

// The second argument is the variant's identity, which the variants transform
// will inject. It is passed explicitly until that transform exists.
export const theme = unstable_variant(
  (request) =>
    request.cookies.get('theme')?.value === 'dark' ? 'dark' : 'light',
  'theme@variants.ts'
)

// A second variant, so that a resolved combination holds more than one pair and
// therefore exercises the canonical ordering.
export const locale = unstable_variant(
  (request) => (request.cookies.get('locale')?.value === 'de' ? 'de' : 'en'),
  'locale@variants.ts'
)

// Deliberately named by no route's `unstable_generateStaticVariants`, which is
// what makes it Tier 2. Every request resolves it, like the others. No
// prerender is produced per value, so it must not partition the cache, and it
// stays a dynamic hole in whichever prerender serves the request.
export const banner = unstable_variant(
  (request) => request.cookies.get('banner')?.value ?? 'none',
  'banner@variants.ts'
)
