'use variants'

import { variant } from 'next/variants'

// The second argument is the variant's identity, which the variants transform
// will inject. It is passed explicitly until that transform exists.
export const theme = variant(
  (request) =>
    request.cookies.get('theme')?.value === 'dark' ? 'dark' : 'light',
  'theme@variants.ts'
)

// A second variant, so that a resolved combination packs more than one pair and
// therefore exercises the `&` separator and the canonical ordering.
export const locale = variant(
  (request) => (request.cookies.get('locale')?.value === 'de' ? 'de' : 'en'),
  'locale@variants.ts'
)
