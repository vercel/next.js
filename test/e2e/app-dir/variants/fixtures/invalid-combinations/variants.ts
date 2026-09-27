'use variants'

import { unstable_variant } from 'next/variants'

// The second argument is the identity of the variant.
//
// TODO(variants): the variants transform injects the identity. This fixture
// passes it explicitly until that transform exists.
export const theme = unstable_variant(
  (request) =>
    request.cookies.get('theme')?.value === 'dark' ? 'dark' : 'light',
  'theme@variants.ts'
)

export const locale = unstable_variant(
  (request) => (request.cookies.get('locale')?.value === 'de' ? 'de' : 'en'),
  'locale@variants.ts'
)

// A third variant, so that two combinations can each assign one that the other
// leaves out while both assign `theme`.
export const country = unstable_variant(
  (request) => (request.cookies.get('country')?.value === 'de' ? 'de' : 'us'),
  'country@variants.ts'
)
