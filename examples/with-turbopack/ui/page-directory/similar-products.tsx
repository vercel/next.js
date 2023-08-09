import { IProduct } from '#/lib/page-directory/get-products'
import { ProductCard } from '#/ui/product-card'

export function SimilarProducts({ products }: { products: IProduct[] }) {
  return (
    <div className="space-y-7">
      <h3 className="text-2xl font-medium text-white">Similar Products</h3>

      <div className="grid grid-cols-4 gap-6">
        {products.map((product) => (
          <div key={product.id} className="col-span-4 lg:col-span-1">
            <ProductCard
              product={product}
              href={`/cert/product/${product.id}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
