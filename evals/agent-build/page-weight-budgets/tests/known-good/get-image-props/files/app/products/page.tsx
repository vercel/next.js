import { ProductBrowser } from '@/components/product-browser'
import { ProductCard } from '@/components/product-card'
import { Sprite } from '@/components/sprite'
import { categories, products } from '@/lib/catalog'

export default function ProductsPage() {
  const items = products.map((p) => ({
    slug: p.slug,
    category: p.category,
    price: p.price,
    card: <ProductCard product={p} />,
  }))
  return (
    <main>
      <h1>All gear</h1>
      <ProductBrowser items={items} categories={categories} />
      <Sprite icons={['heart', 'heart-filled']} star />
    </main>
  )
}
