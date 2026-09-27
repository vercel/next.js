'use client'

import { useParams } from 'next/navigation'

// Regression test for #61951: useParams<T>() must accept both `interface`
// and `type` generic parameters. Previously the constraint was
// `T extends Params` where `Params` has an index signature, which TypeScript
// interfaces do not implicitly satisfy.
interface PageParamsInterface {
  storefront: string
  product: string
}

type PageParamsAlias = {
  storefront: string
  product: string
}

export default function Page() {
  const a = useParams<PageParamsInterface>()
  const b = useParams<PageParamsAlias>()
  return (
    <div>
      {a.storefront}/{a.product} - {b.storefront}/{b.product}
    </div>
  )
}
