import { useState } from 'react'
import Link from 'next/link'
import { useCart, useCheckout } from '@/lib/cart'
import ProductImage from './product-image'
import styles from './product.module.css'

export default function Product({ product }) {
  const { openCart } = useCart()
  const { setLineItems } = useCheckout()
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(
    'very long error long long long long long long long'
  )
  const variant = product.variants.edges[0].node
  const { amount, currencyCode } = variant.priceV2
  const formatCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  })
  const price = formatCurrency.format(amount)
  const onCtaClick = () => {
    console.log(variant)

    setLoading(true)
    setErrorMsg()
    setLineItems([
      {
        variantId: variant.id,
        quantity: 1,
      },
    ])
      .then((data) => {
        const errors = data.checkoutUserErrors

        if (errors.length) {
          console.error('Checkout failed with:', errors.checkoutUserErrors)
          throw errors[0]
        }
        setLoading(false)
        openCart()
      })
      .catch((error) => {
        setLoading(false)
        setErrorMsg(error.message)
      })
  }

  return (
    <div>
      <div className="mb-5">
        <ProductImage
          containerClassName={styles.imageContainer}
          image={variant.image}
          title={product.title}
          slug={product.handle}
          ctaText="Add to Cart"
          ctaLoading={loading}
          ctaError={errorMsg}
          onCtaClick={onCtaClick}
        >
          <button
            type="button"
            className={styles.addToCart}
            onClick={onCtaClick}
            disabled={loading || !!errorMsg}
          >
            {loading ? 'Loading...' : errorMsg || 'Add to Cart'}
          </button>
        </ProductImage>
      </div>
      <h3 className="text-3xl mb-3 leading-snug">
        <Link as={`/posts/${product.handle}`} href="/posts/[slug]">
          <a className="hover:underline">{product.title}</a>
        </Link>
      </h3>
      <p className="text-lg mb-4">{price}</p>
    </div>
  )
}
