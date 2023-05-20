import { ProductDeal } from '#/ui/product-deal'
import { add, formatDistanceToNow } from 'date-fns'
import { type Dinero } from 'dinero.js'

export const ProductLighteningDeal = ({
  price,
  discount,
}: {
  price: Dinero<number>
  discount: {
    amount: Dinero<number>
    expires?: number
  }
}) => {
  const date = add(new Date(), { days: discount.expires })

  return (
    <>
      <div className="flex">
        <div className="rounded bg-gray-600 px-1.5 text-xs font-medium leading-5 text-white">
          Expires in {formatDistanceToNow(date)}
        </div>
      </div>

      <ProductDeal price={price} discount={discount} />
    </>
  )
}
