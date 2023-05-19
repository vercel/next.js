import { getProducts, IProduct } from '#/lib/page-directory/get-products'
import { ProductCard } from '#/ui/product-card'

export const getStaticProps = async () => {
  const products = await getProducts()

  return {
    props: {
      products,
    },
  }
}

export default function Page({ products }: { products: IProduct[] }) {
  return (
    <div className="space-y-7">
      <h1 className="text-3xl font-semibold text-white">My Camera Shop</h1>

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
