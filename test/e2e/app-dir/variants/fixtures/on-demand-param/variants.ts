'use variants'

import { variant } from 'next/variants'

// The second argument is the variant's identity, which the variants transform
// will inject. It is passed explicitly until that transform exists.
export const theme = variant(
  (request) =>
    request.cookies.get('theme')?.value === 'dark' ? 'dark' : 'light',
  'theme@variants.ts'
)
