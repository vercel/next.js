import { useState } from 'react'
import Link from 'next/link'
import ProductQuantity from './product-quantity'

export default function CartItem({ item, onItemUpdate, loading }) {
  const [quantity, setQuantity] = useState(item.quantity)
  const { variant, title } = item
  const { id, image, selectedOptions } = variant
  const updateItem = (data) => {
    onItemUpdate({ variantId: id, ...data })
  }
  const handleQuantity = (e) => {
    const val = Number(e.target.value)

    if (Number.isInteger(val) && val >= 0) {
      setQuantity(e.target.value)
    }
  }
  const handleBlur = (e) => {
    const val = Number(quantity)

    if (val !== item.quantity) {
      updateItem({ quantity: val })
    }
  }
  const increaseQuantity = (n = 1) => {
    const val = Number(quantity) + n

    if (Number.isInteger(val) && val >= 0) {
      setQuantity(val)
      updateItem({ quantity: val })
    }
  }
  const { amount, currencyCode } = variant.priceV2
  const formatCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  })
  const price = formatCurrency.format(amount)
  const size = selectedOptions.find((option) => option.name === 'Size')

  return (
    <>
      <div className="flex flex-col sm:flex-row">
        <div className="flex mb-4 sm:mb-0">
          <Link href="/">
            <a aria-label={title} className="mr-2">
              <img
                className="w-24 h-24"
                src={image.transformedSrc || image.originalSrc}
                alt={image.altText}
              />
            </a>
          </Link>

          <div className="flex flex-col text-left justify-center">
            <Link href="/">
              <a aria-label={title}>
                <h3 className="text-lg hover:text-accent-5 font-medium mb-1">
                  {title}
                </h3>
              </a>
            </Link>
            {size && <p>Size: {size.value}</p>}
          </div>
        </div>

        <div className="flex flex-grow">
          <div className="flex flex-grow justify-start sm:justify-center items-center">
            <ProductQuantity
              value={quantity}
              loading={loading}
              onChange={handleQuantity}
              onIncrease={increaseQuantity}
              onBlur={handleBlur}
            />
          </div>

          <div className="flex flex-col text-right justify-center">
            <span className="text-lg">{price}</span>
          </div>
        </div>
      </div>
      <hr className="my-4" />
    </>
  )
}
