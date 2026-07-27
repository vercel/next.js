import Link from 'next/link'
import { products } from '@/lib/products'

export function ProductGrid() {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <Link
          key={product.slug}
          href={`/product/${product.slug}`}
          className="product-card"
        >
          <div
            className="product-image"
            style={{ backgroundColor: product.color }}
          />
          <h2>{product.name}</h2>
          <p>${product.price}</p>
        </Link>
      ))}
    </div>
  )
}
