import { useState } from 'react'
import ProductImage from './product-image'
import ProductQuantity from './product-quantity'
import Button from './button'

export default function ProductBody({ product }) {
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const variants = product.variants.edges
  const variant = variants[0].node
  const { amount, currencyCode } = variant.priceV2
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

  console.log(product, variants)
  // console.log('s', allSelectedOptions)

  return (
    <main>
      <div className="flex w-full">
        <div className="max-w-lg w-full mr-8">
          <ProductImage image={variant.image} title={product.title} large />
        </div>

        <div className="w-full">
          <h2 className="text-4xl mb-6">{product.title}</h2>
          <h3 className="text-2xl mb-6">{price}</h3>

          {sizes.length > 0 && (
            <div className="mb-6">
              <label className="inline-flex flex-col">
                <span className="text-2xl mb-4">Size</span>
                <div className="inline-block relative">
                  <select
                    className="w-full appearance-none border border-black py-3 pl-4 pr-8"
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
              </label>
            </div>
          )}

          <div className="mb-6">
            <label className="inline-flex flex-col" htmlFor="quantity">
              <span className="text-2xl mb-4">Quantity</span>
              <ProductQuantity
                id="quantity"
                value={quantity}
                loading={loading}
                onChange={handleQuantity}
                onIncrease={increaseQuantity}
                onBlur={handleBlur}
              />
            </label>
          </div>

          <div className="flex flex-col max-w-xs">
            <Button type="button" className="mb-4" secondary>
              Add to Cart
            </Button>
            <Button type="button">Buy it Now</Button>
          </div>
        </div>
      </div>
    </main>
  )
}
