import { Suspense } from 'react'
import { ProductList } from './ProductList'
import { Recommendations } from './Recommendations'

export default function Page() {
  return (
    <main>
      <h1>Store</h1>
      <Suspense fallback={<p>Loading products...</p>}>
        <ProductList />
      </Suspense>
      <Suspense fallback={<p>Loading recommendations...</p>}>
        <Recommendations />
      </Suspense>
    </main>
  )
}
