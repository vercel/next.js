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

// A second variant. A resolved set then holds more than one pair, which
// exercises the canonical ordering.
export const locale = unstable_variant(
  (request) => (request.cookies.get('locale')?.value === 'de' ? 'de' : 'en'),
  'locale@variants.ts'
)
