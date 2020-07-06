import { FC } from 'react'
import { TCart, ICart } from 'interfaces/cart'
import CouponForm from './CouponForm'

const OrderSummary: FC<ICart> = (cartInfo) => {
  const subtotal = cartInfo.prices.subtotal_including_tax.value
  const discount =
    cartInfo.prices.discounts && cartInfo.prices.discounts[0].amount.value
  const grand_total = cartInfo.prices.grand_total.value

  return (
    <div className="col-md-4 order-md-2 mb-4">
      <h4 className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-muted">Order Summary</span>
        {/* <span className='badge badge-secondary badge-pill'>3</span> */}
      </h4>
      <ul className="list-group mb-3 ">
        {cartInfo.items.map((item: TCart) => (
          <li
            key={item.id}
            className="list-group-item d-flex justify-content-between lh-condensed"
          >
            <div>
              <h6 className="my-0">{item.product.name}</h6>
              <small className="text-muted">Qty - {item.quantity}</small>
            </div>
            <span className="text-muted">
              ${item.prices.row_total_including_tax.value}
            </span>
          </li>
        ))}

        <li className="list-group-item d-flex justify-content-between">
          <span>Sub Total</span>
          <strong>${subtotal}</strong>
        </li>

        {discount > 0 && (
          <li className="list-group-item d-flex justify-content-between bg-light">
            <div className="text-success">
              <h6 className="my-0">Discounts</h6>
            </div>
            <span className="text-success">-${discount}</span>
          </li>
        )}
        <li className="list-group-item d-flex justify-content-between">
          <span>Total (USD)</span>
          <strong>${grand_total}</strong>
        </li>
      </ul>
      <CouponForm />
    </div>
  )
}

export default OrderSummary
