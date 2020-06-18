import Link from 'next/link'
import cn from 'classnames'
import { useCart } from '@/lib/cart'
import styles from './product-image.module.css'

export default function ProductImage({ image, title, slug, onClick }) {
  const { openCart } = useCart()
  const img = (
    <img
      src={image.transformedSrc || image.originalSrc}
      alt={image.altText || `Product image for ${title}`}
      className="w-full h-full"
    />
  )

  return (
    <div className="w-full">
      <div
        className={cn(styles.imageContainer, {
          'hover:shadow-medium transition-shadow duration-200': slug,
        })}
      >
        {slug ? (
          <Link as={`/posts/${slug}`} href="/posts/[slug]">
            <a aria-label={title}>{img}</a>
          </Link>
        ) : (
          img
        )}

        <button type="button" className={styles.addToCart} onClick={openCart}>
          Add to Cart
        </button>
      </div>
    </div>
  )
}
