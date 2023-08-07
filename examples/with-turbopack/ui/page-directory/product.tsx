import { type IProduct } from '#/lib/page-directory/get-products'
import { ProductPricing } from '#/ui/page-directory/product-pricing'
import { ProductRating } from '#/ui/product-rating'
import Image from 'next/image'

export const Product = ({ product }: { product: IProduct }) => {
  return (
    <div className="grid grid-cols-4 gap-6">
      <div className="col-span-full lg:col-span-1">
        <div className="space-y-2">
          <Image
            // vs `<img>`, we get:
            // - Automatic formats
            // - Automatic image resizing
            src={`/${product.image}`}
            className="hidden rounded-lg grayscale lg:block"
            alt={product.name}
            height={400}
            width={400}
            placeholder="blur"
            blurDataURL={product.imageBlur}
          />

          <div className="flex space-x-2">
            <div className="w-1/3">
              <Image
                src={`/${product.image}`}
                className="rounded-lg grayscale"
                alt={product.name}
                height={180}
                width={180}
                placeholder="blur"
                blurDataURL={product.imageBlur}
              />
            </div>
            <div className="w-1/3">
              <Image
                src={`/${product.image}`}
                className="rounded-lg grayscale"
                alt={product.name}
                height={180}
                width={180}
                placeholder="blur"
                blurDataURL={product.imageBlur}
              />
            </div>
            <div className="w-1/3">
              <Image
                src={`/${product.image}`}
                className="rounded-lg grayscale"
                alt={product.name}
                height={180}
                width={180}
                placeholder="blur"
                blurDataURL={product.imageBlur}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-full space-y-4 lg:col-span-2">
        <h1 className="truncate text-xl font-medium text-white lg:text-3xl">
          {product.name}
        </h1>

        <ProductRating rating={product.rating} />

        <div className="space-y-4 text-gray-200">{product.description}</div>
      </div>

      <div className="col-span-full lg:col-span-1">
        <ProductPricing product={product} />
      </div>
    </div>
  )
}
