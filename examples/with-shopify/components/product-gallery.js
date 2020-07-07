import cn from 'classnames'
import ProductImage from './product-image'

export default function ProductGallery({ product, activeImage, onClick }) {
  const imagesBySrc = new Map()

  product.variants.edges.forEach(({ node }) => {
    const src = node.image.originalSrc
    const colors = imagesBySrc.get(src)
    const color = node.selectedOptions.find((option) => option.name === 'Color')

    if (color) {
      imagesBySrc.set(src, (colors ?? new Set()).add(color.value))
    }
  })

  // Update the colors map to append the image info and product images that aren't related
  // to a specific variant
  product.images.edges.forEach(({ node }) => {
    const colors = imagesBySrc.get(node.originalSrc) ?? []
    imagesBySrc.set(node.originalSrc, { colors, image: node })
  })

  return (
    <div className="grid grid-cols-p-images gap-2 mt-3">
      {Array.from(imagesBySrc.values(), ({ image }, i) => (
        <button
          key={image.originalSrc}
          className={cn(
            'p-1 cursor-pointer border border-transparent hover:border-accent-2 focus:outline-none',
            {
              'border-accent-2': activeImage.originalSrc === image.originalSrc,
            }
          )}
          onClick={() => onClick(image)}
        >
          <ProductImage image={image} title={product.title} />
        </button>
      ))}
    </div>
  )
}
