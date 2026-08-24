import { Suspense } from 'react'
import { getProducts } from '@/lib/data'

type CatalogSearchParams = Promise<{ category?: string }>

export default function CatalogPage({
  searchParams,
}: {
  searchParams: CatalogSearchParams
}) {
  return (
    <main>
      <h1>Catalog</h1>
      <Suspense fallback={<p>Loading category...</p>}>
        <CategoryResults searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function CategoryResults({
  searchParams,
}: {
  searchParams: CatalogSearchParams
}) {
  const { category = 'featured' } = await searchParams
  const products = await getProducts(category)

  return (
    <section>
      <h2>{category === 'sale' ? 'Products on sale' : 'Featured products'}</h2>
      <ul>
        {products.map((product) => (
          <li key={product}>{product}</li>
        ))}
      </ul>
    </section>
  )
}
