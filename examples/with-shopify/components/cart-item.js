import { useState } from 'react'
import cn from 'classnames'
import Link from 'next/link'
import { MAX_PER_ITEM } from '@/lib/cart'
import { getSize, getColor } from '@/lib/product-utils'
import formatVariantPrice from '@/lib/format-variant-price'
import ProductQuantity from './product-quantity'

export default function CartItem({ item, onItemUpdate, loading }) {
  const [quantity, setQuantity] = useState(item.quantity)
  const { variant, title } = item
  const { id, image } = variant
  const { handle } = variant.product
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
  const { price, compareAtPrice } = formatVariantPrice(variant, item.quantity)
  const size = getSize(variant)
  const color = getColor(variant)

  return (
    <>
      <div className="flex flex-col sm:flex-row">
        <div className="flex w-full sm:w-1/2 mb-4 sm:mb-0">
          <Link href="/p/[slug]" as={`/p/${handle}`}>
            <a aria-label={title} className="flex-shrink-0 mr-2">
              <img
                className="w-24 h-24"
                src={image.transformedSrc || image.originalSrc}
                alt={image.altText}
              />
            </a>
          </Link>

          <div className="flex flex-col text-left justify-center sm:mr-2">
            <Link href="/p/[slug]" as={`/p/${handle}`}>
              <a aria-label={title}>
                <h3 className="text-lg hover:text-accent-5 font-medium mb-1">
                  {title}
                </h3>
              </a>
            </Link>

            {(size || color) && (
              <p>{[size, color].filter(Boolean).join(' / ')}</p>
            )}
          </div>
        </div>

        <div className="flex flex-grow">
          <div className="flex flex-grow items-center">
            <ProductQuantity
              value={quantity}
              max={MAX_PER_ITEM}
              disabled={loading}
              onChange={handleQuantity}
              onIncrease={increaseQuantity}
              onBlur={handleBlur}
            />
          </div>

          <div className="flex flex-col text-right justify-center">
            <span
              className={cn('text-lg', {
                'text-highlight-red': compareAtPrice,
              })}
            >
              {price}
            </span>
            {compareAtPrice && (
              <del className="text-accent-5">{compareAtPrice}</del>
            )}
          </div>
        </div>
      </div>
      <hr className="my-4" />
    </>
  )
}
