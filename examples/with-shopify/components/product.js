import { useState } from 'react'
import Link from 'next/link'
import cn from 'classnames'
import { useCart, useCheckout } from '@/lib/cart'
import ProductImage from './product-image'
import styles from './product.module.css'

export default function Product({ product }) {
  const { openCart } = useCart()
  const { checkout, setLineItems } = useCheckout()
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState()
  const variant = product.variants.edges[0].node
  const { amount, currencyCode } = variant.priceV2
  const formatCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  })
  const price = formatCurrency.format(amount)
  const onCtaClick = () => {
    let found = false
    // Get current items
    const items =
      checkout?.lineItems.edges.map(({ node }) => {
        let { quantity } = node

        if (node.variant.id === variant.id) {
          // Update the current item in the checkout
          found = true
          quantity += 1
        }

        return {
          variantId: node.variant.id,
          quantity,
        }
      }) ?? []

    if (!found) {
      // Add the item to the checkout
      items.push({
        variantId: variant.id,
        quantity: 1,
      })
    }

    setLoading(true)
    setErrorMsg()
    setLineItems(items)
      .then((data) => {
        const errors = data.checkoutUserErrors ?? data.userErrors

        if (errors.length) {
          console.error('Checkout failed with:', errors)
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
              onClick={onCtaClick}
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
      <p className="text-lg">{price}</p>
    </div>
  )
}
