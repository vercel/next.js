import ProductImage from './product-image'

export default function ProductBody({ product }) {
  const variants = product.variants.edges
  const variant = variants[0].node
  const { amount, currencyCode } = variant.priceV2
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

  // console.log(product, variants)
  // console.log('s', allSelectedOptions)

  return (
    <main>
      <div className="flex w-full">
        <div className="max-w-lg w-full mr-8">
          <ProductImage image={variant.image} title={product.title} large />
        </div>
        <div>
          <h2 className="text-4xl mb-6">{product.title}</h2>
          <h3 className="text-2xl mb-6">{price}</h3>

          {sizes.length && (
            <label className="flex flex-col">
              <span className="text-2xl mb-4">Size</span>
              <div className="relative">
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
          )}
        </div>
      </div>
    </main>
  )
}
