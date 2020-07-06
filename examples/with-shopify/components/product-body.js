import { useState } from 'react'
import cn from 'classnames'
import { useCart, useCheckout } from '@/lib/cart'
import ProductImage from './product-image'
import ProductQuantity from './product-quantity'
import Button from './button'
import markdownStyles from './markdown-styles.module.css'

export default function ProductBody({ product }) {
  const variants = product.variants.edges
  const variant = variants[0].node
  const { amount, currencyCode } = variant.priceV2

  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const [activeImage, setActiveImage] = useState(variant.image)
  const { openCart } = useCart()
  const { checkout, setLineItems } = useCheckout()

  const handleQuantity = (e) => {
    const val = Number(e.target.value)

    if (Number.isInteger(val) && val >= 0) {
      setQuantity(e.target.value)
    }
  }
  const handleBlur = (e) => {
    // Reset the quantity to 1 if it's manually set to a lower number
    if (Number(quantity) <= 0) setQuantity(1)
  }
  const increaseQuantity = (n = 1) => {
    const val = Number(quantity) + n

    if (Number.isInteger(val) && val > 0) {
      setQuantity(val)
    }
  }
  const addToCart = () => {
    const val = Number(quantity)
    let found = false

    // Get current items
    const items =
      checkout?.lineItems.edges.map(({ node }) => {
        let { quantity: currentQuantity } = node

        if (node.variant.id === variant.id) {
          // Update the current item in the checkout
          found = true
          currentQuantity += val
        }

        return {
          variantId: node.variant.id,
          quantity: currentQuantity,
        }
      }) ?? []

    if (!found) {
      // Add the item to the checkout
      items.push({
        variantId: variant.id,
        quantity: val,
      })
    }

    setLoading(true)
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
      })
  }

  const formatCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  })
  const price = formatCurrency.format(amount)
  const size = variant.selectedOptions.find((option) => option.name === 'Size')

  const allSelectedOptions = variants.flatMap(({ node }) => {
    return node.selectedOptions
  })
  const sizes = allSelectedOptions.filter((option) => option.name === 'Size')

  const colorsByImage = new Map()

  variants.forEach(({ node }) => {
    const src = node.image.originalSrc
    const colors = colorsByImage.get(src)
    const color = node.selectedOptions.find((option) => option.name === 'Color')

    if (color) {
      colorsByImage.set(src, (colors ?? new Set()).add(color.value))
    }
  })

  // Update the colors map to append the image info and product images that aren't related
  // to a specific variant
  product.images.edges.forEach(({ node }) => {
    const colors = colorsByImage.get(node.originalSrc) ?? []
    colorsByImage.set(node.originalSrc, { colors, image: node })
  })

  console.log(product, variants)
  // console.log('s', allSelectedOptions)

  return (
    <main>
      <div className="flex flex-col md:flex-row w-full">
        <div className="md:max-w-lg w-full md:mr-8">
          <ProductImage image={activeImage} title={product.title} />
          <div className="grid grid-cols-p-images gap-2 mt-3">
            {Array.from(colorsByImage.values(), ({ image }, i) => (
              <div
                key={image.originalSrc}
                className={cn(
                  'p-1 cursor-pointer border border-transparent hover:border-accent-2',
                  {
                    'border-accent-2':
                      activeImage.originalSrc === image.originalSrc,
                  }
                )}
                onClick={() => setActiveImage(image)}
              >
                <ProductImage image={image} title={product.title} />
              </div>
            ))}
          </div>
        </div>

        <div className="w-full mt-8 md:mt-0">
          <h2 className="text-5xl mb-6">{product.title}</h2>
          <h3 className="text-2xl mb-6">{price}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-12 md:gap-6">
            {sizes.length > 0 && (
              <div className="flex flex-col">
                <div className="text-2xl mb-4">
                  <label htmlFor="size">Size</label>
                </div>

                <div className="max-w-xs inline-block relative">
                  <select
                    className="w-full h-12 appearance-none border border-black py-2 pl-4 pr-8"
                    name="size"
                    id="size"
                    defaultValue={size.value}
                  >
                    {sizes.map((s) => (
                      <option key={s.value}>{s.value}</option>
                    ))}
                  </select>
                  <div className="absolute pointer-events-none inset-y-0 right-0 flex items-center px-2">
                    <svg
                      className="fill-current h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            <div className="inline-flex flex-col">
              <div className="text-2xl mb-4">
                <label htmlFor="quantity">Quantity</label>
              </div>
              <ProductQuantity
                id="quantity"
                value={quantity}
                loading={loading}
                onChange={handleQuantity}
                onIncrease={increaseQuantity}
                onBlur={handleBlur}
              />
            </div>
          </div>

          <div className="flex flex-col md:max-w-xs mt-12">
            <Button
              type="button"
              className="mb-4"
              onClick={addToCart}
              disabled={loading}
              secondary
            >
              Add to Cart
            </Button>
            <Button type="button">Buy it Now</Button>
          </div>

          {product.descriptionHtml?.length > 0 && (
            <div className="max-w-2xl mt-12">
              <div
                className={markdownStyles['markdown']}
                dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
