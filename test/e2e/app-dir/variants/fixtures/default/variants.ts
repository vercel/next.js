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

// Deliberately never named by any route's `generateStaticVariants`, which is
// what makes it Tier 2: it is resolved for every request like the others, but
// no prerender is produced per value, so it must not partition the cache and
// must be a dynamic hole in whatever prerender does serve the request.
export const banner = unstable_variant(
  (request) => request.cookies.get('banner')?.value ?? 'none',
  'banner@variants.ts'
)
