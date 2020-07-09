import { useMemo, useReducer, useEffect } from 'react'
import cn from 'classnames'
import { useCheckout } from '@/lib/cart'
import { getVariantsMetadata, getSize, getColor } from '@/lib/product-utils'
import formatVariantPrice from '@/lib/format-variant-price'
import ProductImage from './product-image'
import ZoomImage from './zoom-image'
import ProductQuantity from './product-quantity'
import Button from './button'
import SelectInput from './select-input'
import markdownStyles from './markdown-styles.module.css'
import ProductGallery from './product-gallery'

// Get the currently active variant
function getVariant(variants, { size, color }) {
  return variants.find(
    ({ node }) => getSize(node) === size && getColor(node) === color
  )?.node
}

function reducer(state, action) {
  switch (action.type) {
    case 'update':
      return { ...state, ...action.payload }
    case 'reset':
      return initState(action.payload)
    default:
      throw new Error()
  }
}

const initState = (variant) => ({
  id: variant.id,
  quantity: 1,
  image: variant.image,
  size: getSize(variant),
  color: getColor(variant),
  hasZoom: false,
})

export default function ProductBody({ product }) {
  const variants = product.variants.edges
  const initialVariant = variants[0].node
  const { colors, colorsBySize } = useMemo(
    () => getVariantsMetadata(variants),
    [variants]
  )
  const [state, dispatch] = useReducer(reducer, initialVariant, initState)
  const { loading, errorMsg, addItem, buyNow } = useCheckout()

  useEffect(() => {
    // If the initial variant changes for any reason, reset the state
    // This ensures a valid state for navigations between products in this page
    if (initialVariant.id !== state.id) {
      dispatch({ type: 'reset', payload: initialVariant })
    }
  }, [initialVariant, state.id])

  const variant = getVariant(variants, state) ?? initialVariant
  const { price, compareAtPrice, discount } = formatVariantPrice(variant)
  const availableColors = colorsBySize.get(state.size)
  const update = (payload) => dispatch({ type: 'update', payload })
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
  const handleSizeChange = (e) => {
    const size = e.target.value
    const sizeColors = colorsBySize.get(size)
    const color = sizeColors.includes(state.color) ? state.color : sizeColors[0]
    const { image } = getVariant(variants, { size, color })

    update({ size, color, image })
  }
  const handleColorChange = (e) => {
    const color = e.target.value
    const { image } = getVariant(variants, { size: state.size, color })

    update({ color, image })
  }

  const addToCart = () => addItem(variant, Number(state.quantity))
  const buyItNow = () => {
    buyNow(variant, Number(state.quantity)).then((data) => {
      window.open(data.checkout.webUrl)
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
              onClick={() => update({ hasZoom: !state.hasZoom })}
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
                  onChange={handleColorChange}
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

          <div className="flex flex-col md:max-w-xs mt-8">
            <p className="text-error h-6 mb-4">{errorMsg}</p>
            <Button
              type="button"
              className="mb-4"
              onClick={addToCart}
              disabled={loading}
              secondary
            >
              Add to Cart
            </Button>
            <Button type="button" onClick={buyItNow} disabled={loading}>
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
