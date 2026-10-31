import { CatalogBrowser } from '@/components/catalog-browser'
import { ProductCard } from '@/components/product-card'
import { categories, products } from '@/lib/catalog'
import { summarize } from '@/lib/summary'

export default function ProductsPage() {
  const items = products.map((p) => ({
    slug: p.slug,
    category: p.category,
    price: p.price,
    card: <ProductCard product={summarize(p)} />,
  }))
  return (
    <main>
      <h1>All gear</h1>
      <CatalogBrowser categories={categories} items={items} />
    </main>
  )
}
