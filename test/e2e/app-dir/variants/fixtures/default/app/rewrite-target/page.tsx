import { Suspense } from 'react'

import { VariantValues } from '../variant-values'

// The proxy rewrites `/rewrite-source` here. The variants of this route are the
// ones that apply, because a rewrite decides which route renders.
export default function Page() {
  return (
    <Suspense fallback={<p id="pending">pending</p>}>
      <VariantValues />
    </Suspense>
  )
}
