import Image from 'next/image'
import Link from 'next/link'
import { SaveButton } from '@/components/save-button'
import { Stars } from '@/components/stars'
import { formatPrice } from '@/lib/format'
import type { ProductSummary } from '@/lib/summary'

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <li className="card">
      <Link href={`/products/${product.slug}`}>
        <Image
          src={product.image}
          alt={product.name}
          width={280}
          height={280}
          sizes="280px"
          className="card-photo"
        />
        <h3>{product.name}</h3>
      </Link>
      <p className="price">{formatPrice(product.price)}</p>
      <Stars rating={product.rating} />
      <SaveButton name={product.name} />
    </li>
  )
}
