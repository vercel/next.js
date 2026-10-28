import { getImageProps } from 'next/image'
import Link from 'next/link'
import { SaveButton } from '@/components/save-button'
import { Stars } from '@/components/stars'
import { formatPrice, type Product } from '@/lib/catalog'

// Pages that render cards need <Sprite icons={['heart', 'heart-filled']} star />.
export function ProductCard({ product }: { product: Product }) {
  const { props: photo } = getImageProps({
    src: product.image,
    alt: product.name,
    width: 280,
    height: 280,
    className: 'card-photo',
  })
  return (
    <li className="card">
      <Link href={`/products/${product.slug}`}>
        <img {...photo} />
        <h3>{product.name}</h3>
      </Link>
      <p className="price">{formatPrice(product.price)}</p>
      <Stars rating={product.rating} />
      <SaveButton name={product.name} />
    </li>
  )
}
