import cn from 'classnames'
import ProductImage from './product-image'
import { useImages } from '@/lib/product-utils'

export default function ProductGallery({ product, activeImage, onClick }) {
  const images = useImages(product)

  return (
    <div className="grid grid-cols-p-images gap-2 mt-3">
      {Array.from(images.values(), (image, i) => (
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
