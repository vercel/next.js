// Expect: INSTANT — the params promise is passed down unawaited and only
// awaited inside the Suspense-wrapped child, exactly the fix that
// errors/blocking-route.mdx prescribes.
import { Suspense } from 'react'
import { ProductDetails } from './product-details'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <h1>Product</h1>
      <Suspense fallback={<p>Loading product…</p>}>
        <ProductDetails params={params} />
      </Suspense>
    </div>
  )
}
