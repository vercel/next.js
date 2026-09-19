import Link from 'next/link'
import { products } from '@/lib/products'

export default function Page() {
  return (
    <main>
      <h1>Northstar Supply</h1>
      <ul>
        {products.map((product) => (
          <li key={product.slug}>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
