import { useState } from 'react'
import cn from 'classnames'
import { useCheckout } from '@/lib/cart'
import formatVariantPrice from '@/lib/format-variant-price'
import ProductImage from './product-image'
import ZoomImage from './zoom-image'
import ProductQuantity from './product-quantity'
import Button from './button'
import SelectInput from './select-input'
import markdownStyles from './markdown-styles.module.css'
import ProductGallery from './product-gallery'

export default function ProductBody({ product }) {
  const variants = product.variants.edges
  const variant = variants[0].node
  const { price, compareAtPrice, discount } = formatVariantPrice(variant)
  const size = variant.selectedOptions.find((option) => option.name === 'Size')
  const color = variant.selectedOptions.find(
    (option) => option.name === 'Color'
  )
  // Use a Set to avoid duplicates
  const colors = new Set()
  const colorsBySize = new Map()

  variants.forEach(({ node }) => {
    const nodeSize = node.selectedOptions.find(
      (option) => option.name === 'Size'
    )
    const nodeColor = node.selectedOptions.find(
      (option) => option.name === 'Color'
    )

    if (nodeColor) colors.add(nodeColor.value)
    if (nodeSize) {
      const sizeColors = colorsBySize.get(nodeSize.value) || []

      if (nodeColor) sizeColors.push(nodeColor.value)

      colorsBySize.set(nodeSize.value, sizeColors)
    }
  })

  const [quantity, setQuantity] = useState(1)
  const [activeImage, setActiveImage] = useState(variant.image)
  const [sizeValue, setSizeValue] = useState(size?.value)
  const [colorValue, setColorValue] = useState(color?.value)
  const [hasZoom, setHasZoom] = useState(false)
  const { loading, errorMsg, addVariantToCart } = useCheckout()
  const availableColors = colorsBySize.get(sizeValue)

  const handleQuantity = (e) => {
    const val = Number(e.target.value)

    if (Number.isInteger(val) && val >= 0) {
      setQuantity(e.target.value)
    }
  }
  const handleQuantityBlur = (e) => {
    // Reset the quantity to 1 if it's manually set to a lower number
    if (Number(quantity) <= 0) setQuantity(1)
  }
  const increaseQuantity = (n = 1) => {
    const val = Number(quantity) + n

    if (Number.isInteger(val) && val > 0) {
      setQuantity(val)
    }
  }
  const changeColor = (value) => {
    const { node } = variants.find(({ node }) =>
      node.selectedOptions.some(
        (option) => option.name === 'Color' && option.value === value
      )
    )

    setColorValue(value)
    setActiveImage(node.image)
  }
  const handleSizeChange = (e) => {
    const sizeColors = colorsBySize.get(e.target.value)

    setSizeValue(e.target.value)

    if (!sizeColors.includes(colorValue)) {
      changeColor(sizeColors[0])
    }
  }

  return (
    <main>
      <div className="flex flex-col md:flex-row w-full">
        <div className="md:max-w-lg w-full md:mr-8">
          <ZoomImage src={activeImage.originalSrc}>
            <ProductImage
              className={cn({
                'cursor-zoom-out hover:opacity-0': hasZoom,
                'cursor-zoom-in': !hasZoom,
              })}
              image={activeImage}
              title={product.title}
              onClick={() => setHasZoom(!hasZoom)}
            />
          </ZoomImage>

          <ProductGallery
            product={product}
            activeImage={activeImage}
            onClick={(image) => setActiveImage(image)}
          />
        </div>

        <div className="w-full mt-8 md:mt-0">
          <h2 className="text-5xl mb-6">{product.title}</h2>
          <div className="flex items-center mb-6">
            <h3
              className={cn('text-3xl mr-4', {
                'text-highlight-red': compareAtPrice,
              })}
            >
              {price}
            </h3>
            {compareAtPrice && (
              <div className="text-lg text-accent-5">
                <del className="mr-2">{compareAtPrice}</del>
                <span className="font-medium">-{discount}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-12 md:gap-6">
            {size && (
              <div className="flex flex-col">
                <div className="text-2xl mb-4">
                  <label htmlFor="size">Size</label>
                </div>

                <SelectInput
                  name="size"
                  id="size"
                  value={sizeValue}
                  onChange={handleSizeChange}
                >
                  {Array.from(colorsBySize.keys(), (value) => (
                    <option key={value}>{value}</option>
                  ))}
                </SelectInput>
              </div>
            )}

            {color && (
              <div className="flex flex-col">
                <div className="text-2xl mb-4">
                  <label htmlFor="color">Color</label>
                </div>

                <SelectInput
                  name="color"
                  id="color"
                  value={colorValue}
                  onChange={(e) => changeColor(e.target.value)}
                >
                  {Array.from(colors, (value) => (
                    <option
                      key={value}
                      disabled={!availableColors.includes(value)}
                    >
                      {value}
                    </option>
                  ))}
                </SelectInput>
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
                onBlur={handleQuantityBlur}
              />
            </div>
          </div>

          <div className="flex flex-col md:max-w-xs mt-12">
            <Button
              type="button"
              className="mb-4"
              onClick={() => addVariantToCart(variant, Number(quantity))}
              disabled={loading}
              secondary
            >
              Add to Cart
            </Button>
            <Button type="button" disabled={loading}>
              Buy it Now
            </Button>
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
