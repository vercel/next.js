import { TCartTotal } from 'interfaces/cart'

const CartTotal = (cartInfo: TCartTotal) => {
  return (
    <>
      <tr>
        <td> &nbsp; </td>
        <td> &nbsp; </td>
        <td> &nbsp; </td>
        <td>
          <h6>Subtotal</h6>
        </td>
        <td className="text-right">
          <h6>
            <strong>${cartInfo.subtotal_including_tax.value}</strong>
          </h6>
        </td>
      </tr>
      {cartInfo.discounts && (
        <tr>
          <td> &nbsp; </td>
          <td> &nbsp; </td>
          <td> &nbsp; </td>
          <td>
            <h6>Discounts</h6>
          </td>
          <td className="text-right">
            <h6>
              <strong>${cartInfo.discounts[0].amount.value}</strong>
            </h6>
          </td>
        </tr>
      )}
      <tr>
        <td> &nbsp; </td>
        <td> &nbsp; </td>
        <td> &nbsp; </td>
        <td>
          <h6>Total</h6>
        </td>
        <td className="text-right">
          <h6>
            <strong>${cartInfo.grand_total.value}</strong>
          </h6>
        </td>
      </tr>
    </>
  )
}

export default CartTotal
