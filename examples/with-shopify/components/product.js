import Link from 'next/link'
import cn from 'classnames'
import { useCheckout } from '@/lib/cart'
import formatVariantPrice from '@/lib/format-variant-price'
import ProductImage from './product-image'
import styles from './product.module.css'

export default function Product({ product }) {
  const { loading, errorMsg, addVariantToCart } = useCheckout()
  const variant = product.variants.edges[0].node
  const { price, compareAtPrice, discount } = formatVariantPrice(variant)

  return (
    <div>
      <div className="relative max-w-sm w-full mb-5">
        <ProductImage
          containerClassName={styles.imageContainer}
          image={variant.image}
          title={product.title}
          slug={product.handle}
        >
          <div
            className={cn(styles.ctaContainer, styles.hide, {
              [styles.show]: loading || errorMsg,
            })}
          >
            <p
              className={cn(styles.error, styles.hide, {
                [styles.show]: errorMsg,
              })}
            >
              {errorMsg}
            </p>
            <button
              type="button"
              className={styles.addToCart}
              onClick={() => addVariantToCart(variant)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Add to Cart'}
            </button>
          </div>
        </ProductImage>
      </div>
      <h3 className="text-3xl mb-3 leading-snug">
        <Link as={`/p/${product.handle}`} href="/p/[slug]">
          <a className="hover:underline">{product.title}</a>
        </Link>
      </h3>
      <div className="flex items-center">
        <span
          className={cn('text-2xl mr-4', {
            'text-highlight-red': compareAtPrice,
          })}
        >
          {price}
        </span>
        {compareAtPrice && (
          <div className="text-lg text-accent-5">
            <del className="mr-2">{compareAtPrice}</del>
            <span className="font-medium">-{discount}</span>
          </div>
        )}
      </div>
    </div>
  )
}
