import { useState, useEffect } from 'react'
import Link from 'next/link'
import cn from 'classnames'
import { useCheckout } from '@/lib/cart'
import { useImages } from '@/lib/product-utils'
import formatVariantPrice from '@/lib/format-variant-price'
import ProductImage from './product-image'
import styles from './product.module.css'

const defaultState = {
  hasHover: false,
  position: 0,
  delay: 1000,
}

function useTransition(length) {
  const [{ hasHover, position, delay }, setTransition] = useState(defaultState)
  const initTransition = () => {
    setTransition({ hasHover: true, position, delay })
  }
  const stopTransition = () => {
    setTransition(defaultState)
  }

  useEffect(() => {
    if (!hasHover || length < 1) return

    const timeout = setTimeout(() => {
      const next = position + 1

      setTransition({
        hasHover: true,
        position: next > length ? 0 : next,
        delay: 2200,
      })
    }, delay)

    return () => clearTimeout(timeout)
  }, [hasHover, position, delay, length])

  return { position, initTransition, stopTransition }
}

export default function Product({ product }) {
  const { loading, errorMsg, addItem } = useCheckout()
  const images = useImages(product)
  const variants = product.variants.edges
  const variant = variants[0].node
  const { price, compareAtPrice, discount } = formatVariantPrice(variant)

  // Delete the first image as it's the one added by `ProductImage`
  images.delete(variant.image.originalSrc)

  const { position, initTransition, stopTransition } = useTransition(
    images.size
  )

  return (
    <div>
      <div className="relative max-w-sm w-full mb-5">
        <ProductImage
          className={cn('z-10', styles.imageTransition, {
            'opacity-0': position > 0,
          })}
          containerClassName={styles.imageContainer}
          image={variant.image}
          title={product.title}
          slug={product.handle}
          onMouseEnter={() => initTransition()}
          onMouseLeave={() => stopTransition()}
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
              onClick={() => addItem(variant)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Add to Cart'}
            </button>
          </div>

          {Array.from(images.values(), (image, i) => (
            <img
              key={image.transformedSrc}
              src={image.transformedSrc}
              className={cn('absolute opacity-0', styles.imageTransition, {
                'opacity-100': position === i + 1,
              })}
            />
          ))}
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
