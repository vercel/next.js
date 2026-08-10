import { Suspense } from 'react'
import { ProductGrid } from './ProductGrid'
import { ProductGridSkeleton } from './ProductSkeleton'

export default function Home() {
  return (
    <main>
      <h1>Products</h1>
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductGrid />
      </Suspense>
    </main>
  )
}
