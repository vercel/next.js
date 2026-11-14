import { Suspense } from 'react'

import { VariantValues } from './variant-values'

export default function Page() {
  return (
    <Suspense fallback={<p id="pending">pending</p>}>
      <VariantValues />
    </Suspense>
  )
}
