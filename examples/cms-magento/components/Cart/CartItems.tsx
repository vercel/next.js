import { TCart } from 'interfaces/cart'
import { useSelector } from 'react-redux'
import { IInitialState } from 'interfaces/state'
import { motion } from 'framer-motion'

type Inputs = {
  cart_item_id: string
  sku: string
  quantity?: Number
}

type TCartItem = {
  cartItem: TCart
  handleItemRemove: ({ cart_item_id, sku }: Inputs) => Promise<void>
  handleItemUpdate: ({ cart_item_id, sku, quantity }: Inputs) => Promise<void>
}

const item = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
}

const CartItems = ({
  cartItem,
  handleItemRemove,
  handleItemUpdate,
}: TCartItem) => {
  const { loading: productLoading, id } = useSelector(
    (state: IInitialState) => state
  )

  let {
    product: {
      name,
      price_range: { maximum_price },
    },
    quantity,
    prices: {
      row_total_including_tax: { value },
    },
  } = cartItem

  let final_price = maximum_price.final_price.value
  let total_price = value

  return (
    <motion.tr key={cartItem.id} variants={item}>
      <td className="col-sm-8 col-md-6">
        <div className="media">
          <a className="thumbnail pull-left" href="#">
            <img
              className="media-object"
              width={60}
              src={cartItem.product.thumbnail.url}
            />
          </a>
          <div className="media-body ml-3 pt-4">
            <h6 className="media-heading">{name}</h6>
          </div>
        </div>
      </td>
      <td className="col-sm-1 col-md-1 align-middle">
        <select
          className="form-control p-0 px-2"
          name="qty"
          value={quantity}
          onChange={(e) => {
            let quantity = +e.currentTarget.value

            handleItemUpdate({
              cart_item_id: cartItem.id,
              sku: cartItem.product.sku,
              quantity,
            })
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((qt, i) => (
            <option value={qt} key={i}>
              {qt}
            </option>
          ))}
        </select>
      </td>
      <td className="col-sm-1 col-md-1 text-center align-middle">
        <strong>${final_price}</strong>
      </td>
      <td className="col-sm-1 col-md-1 text-center align-middle">
        <strong>${total_price}</strong>
      </td>
      <td className="col-sm-1 col-md-1 align-middle">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          type="submit"
          disabled={cartItem.id === id && productLoading}
          onClick={() =>
            handleItemRemove({
              cart_item_id: cartItem.id,
              sku: cartItem.product.sku,
            })
          }
          className="btn btn-danger"
        >
          <span className="glyphicon glyphicon-remove" /> Remove
        </motion.button>
      </td>
    </motion.tr>
  )
}

export default CartItems
