'use variants'

import { unstable_variant } from 'next/variants'

export const theme = unstable_variant(
  (request) => request.cookies.get('theme')?.value ?? 'light',
  'theme@variants.ts'
)
