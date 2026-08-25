// Expect: BLOCKING (runtime data) — `await params` directly in the page body
// blocks the shell even though the product fetch below it is under Suspense.
import { Suspense } from 'react'
import { ProductDetails } from './product-details'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div>
      <h1>Product</h1>
      <Suspense fallback={<p>Loading product…</p>}>
        <ProductDetails id={id} />
      </Suspense>
    </div>
  )
}
