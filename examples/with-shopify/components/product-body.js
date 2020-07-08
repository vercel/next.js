import { useMemo, useReducer } from 'react'
import cn from 'classnames'
import { useCheckout } from '@/lib/cart'
import { isSize, isColor } from '@/lib/product-utils'
import formatVariantPrice from '@/lib/format-variant-price'
import ProductImage from './product-image'
import ZoomImage from './zoom-image'
import ProductQuantity from './product-quantity'
import Button from './button'
import SelectInput from './select-input'
import markdownStyles from './markdown-styles.module.css'
import ProductGallery from './product-gallery'

function getVariantMetadata(variant, variants) {
  const data = {
    ...formatVariantPrice(variant),
    size: variant.selectedOptions.find(isSize),
    color: variant.selectedOptions.find(isColor),
    // Use a Set to avoid duplicates
    colors: new Set(),
    colorsBySize: new Map(),
  }

  variants.forEach(({ node }) => {
    const nodeSize = node.selectedOptions.find(isSize)
    const nodeColor = node.selectedOptions.find(isColor)

    if (nodeColor) data.colors.add(nodeColor.value)
    if (nodeSize) {
      const sizeColors = data.colorsBySize.get(nodeSize.value) || []

      if (nodeColor) sizeColors.push(nodeColor.value)

      data.colorsBySize.set(nodeSize.value, sizeColors)
    }
  })

  return data
}

function reducer(state, action) {
  switch (action.type) {
    case 'update':
      return { ...state, ...action.newState }
    default:
      throw new Error()
  }
}

export default function ProductBody({ product }) {
  const variants = product.variants.edges
  const variant = variants[0].node
  const {
    price,
    compareAtPrice,
    discount,
    size,
    color,
    colors,
    colorsBySize,
  } = useMemo(() => getVariantMetadata(variant, variants), [variant, variants])
  const [state, dispatch] = useReducer(reducer, {
    quantity: 1,
    image: variant.image,
    size: size?.value,
    color: color?.value,
    hasZoom: false,
  })
  const update = (newState) => dispatch({ type: 'update', newState })
  const { loading, errorMsg, addVariantToCart } = useCheckout()
  const availableColors = colorsBySize.get(state.size)

  const handleQuantity = (e) => {
    const val = Number(e.target.value)

    if (Number.isInteger(val) && val >= 0) {
      update({ quantity: e.target.value })
    }
  }
  const handleQuantityBlur = (e) => {
    if (Number(state.quantity) <= 0) {
      // Reset the quantity to 1 if it's manually set to a lower number
      update({ quantity: 1 })
    }
  }
  const increaseQuantity = (n = 1) => {
    const val = Number(state.quantity) + n

    if (Number.isInteger(val) && val > 0) {
      update({ quantity: val })
    }
  }
  const changeColor = (value) => {
    const { node } = variants.find(({ node }) =>
      node.selectedOptions.some(
        (option) => isColor(option) && option.value === value
      )
    )

    update({ color: value, image: node.image })
  }
  const handleSizeChange = (e) => {
    const sizeColors = colorsBySize.get(e.target.value)

    update({
      size: e.target.value,
      color: sizeColors.includes(state.color) ? state.color : sizeColors[0],
    })
  }

  return (
    <main>
      <div className="flex flex-col md:flex-row w-full">
        <div className="md:max-w-lg w-full md:mr-8">
          <ZoomImage src={state.image.originalSrc}>
            <ProductImage
              className={cn({
                'cursor-zoom-out hover:opacity-0': state.hasZoom,
                'cursor-zoom-in': !state.hasZoom,
              })}
              image={state.image}
              title={product.title}
              onClick={() => update({ hasZoom: !!state.hasZoom })}
            />
          </ZoomImage>

          <ProductGallery
            product={product}
            activeImage={state.image}
            onClick={(image) => update({ image })}
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
            {state.size && (
              <div className="flex flex-col">
                <div className="text-2xl mb-4">
                  <label htmlFor="size">Size</label>
                </div>

                <SelectInput
                  name="size"
                  id="size"
                  value={state.size}
                  onChange={handleSizeChange}
                >
                  {Array.from(colorsBySize.keys(), (value) => (
                    <option key={value}>{value}</option>
                  ))}
                </SelectInput>
              </div>
            )}

            {state.color && (
              <div className="flex flex-col">
                <div className="text-2xl mb-4">
                  <label htmlFor="color">Color</label>
                </div>

                <SelectInput
                  name="color"
                  id="color"
                  value={state.color}
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
                value={state.quantity}
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
              onClick={() => addVariantToCart(variant, Number(state.quantity))}
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
