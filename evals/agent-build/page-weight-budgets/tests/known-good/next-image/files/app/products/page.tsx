import { ProductBrowser } from '@/components/product-browser'
import { categories, products, toCard } from '@/lib/catalog'

export default function ProductsPage() {
  return (
    <ProductBrowser products={products.map(toCard)} categories={categories} />
  )
}
