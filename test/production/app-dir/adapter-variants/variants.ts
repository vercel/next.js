'use variants'

import { unstable_variant } from 'next/variants'

// The variants transform will inject each identity. The fixture supplies them
// until that transform exists.
export const theme = unstable_variant(
  (request) =>
    request.cookies.get('theme')?.value === 'dark' ? 'dark' : 'light',
  'theme@variants.ts'
)

export const locale = unstable_variant(
  (request) => (request.cookies.get('locale')?.value === 'de' ? 'de' : 'en'),
  'locale@variants.ts'
)
