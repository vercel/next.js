import { Suspense } from 'react'

import { VariantValues } from '../variant-values'

// This route reads variants, and the `config.matcher` of the proxy omits it on
// purpose. A project can write that mistake today, because the matcher and the
// table of variants per route are separate and nothing keeps them in step. The
// proxy resolves nothing for a request here, so the read fails.
//
// TODO(variants): the variants transform derives the matcher as the union of
// the matcher of the user and every route that reads a variant. A route that
// reads a variant is then always matched.
export default function Page() {
  return (
    <Suspense fallback={<p id="pending">pending</p>}>
      <VariantValues />
    </Suspense>
  )
}
