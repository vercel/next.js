import { Suspense } from 'react'

import { country, locale, theme } from '../../variants'
import { VariantValues } from '../variant-values'

// Three combinations that are all accepted. The second assigns everything the
// first does and one variant more, so the two are ordered. The third assigns a
// variant that neither of the others does, and gives `theme` a different value,
// so no request matches it together with either.
export function unstable_generateStaticVariants() {
  return [
    [[theme, 'dark']],
    [
      [theme, 'dark'],
      [locale, 'en'],
    ],
    [
      [theme, 'light'],
      [country, 'us'],
    ],
  ]
}

export default function Page() {
  return (
    <Suspense fallback={<p id="pending">pending</p>}>
      <VariantValues />
    </Suspense>
  )
}
