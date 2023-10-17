import { type IProduct } from '#/lib/page-directory/get-products'
import { ProductEstimatedArrival } from '#/ui/product-estimated-arrival'
import { ProductLowStockWarning } from '#/ui/product-low-stock-warning'
import { ProductPrice } from '#/ui/product-price'
import { ProductSplitPayments } from '#/ui/product-split-payments'
import { ProductUsedPrice } from '#/ui/product-used-price'
import { dinero, type DineroSnapshot } from 'dinero.js'

export function ProductPricing({ product }: { product: IProduct }) {
  const price = dinero(product.price as DineroSnapshot<number>)

  return (
    <div className="space-y-4 rounded-lg bg-gray-900 p-3">
      <ProductPrice price={price} discount={product.discount} />
      <ProductSplitPayments price={price} />
      {product.usedPrice ? (
        <ProductUsedPrice usedPrice={product.usedPrice} />
      ) : null}
      <ProductEstimatedArrival leadTime={product.leadTime} hasDeliveryTime />
      {product.stock <= 1 ? (
        <ProductLowStockWarning stock={product.stock} />
      ) : null}

      <button
        onClick={() => console.log(`${product.name} added to cart!`)}
        className="relative w-full items-center space-x-2 rounded-lg bg-vercel-blue px-3 py-1  text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70"
      >
        Add to Cart
      </button>
    </div>
  )
}
