import useCart from 'hooks/useCart'
import Link from 'next/link'
import { motion } from 'framer-motion'

import { ICart, TCart } from 'interfaces/cart'
import CartTotal from './CartTotal'
import CartItems from './CartItems'
import FadeIn from 'react-fade-in'
import { FC } from 'react'

type Inputs = {
  cart_item_id: string
  sku: string
  quantity?: Number
}

interface Props {
  cartInfo: ICart | undefined
  guestId: string
  customerId: string
  token: string | undefined
}

const CartInfo: FC<Props> = ({ cartInfo, guestId, customerId, token }) => {
  const { removeItemFromCart, updateCartItems } = useCart()

  const handleItemRemove = async ({ cart_item_id, sku }: Inputs) => {
    let item = {
      customerId,
      guestId,
      cart_item_id,
      sku,
      token,
    }
    await removeItemFromCart(item)
  }

  const handleItemUpdate = async ({ cart_item_id, sku, quantity }: Inputs) => {
    let item = {
      customerId,
      guestId,
      cart_item_id,
      sku,
      quantity,
      token,
    }

    await updateCartItems(item)
  }

  return (
    <div>
      <FadeIn>
        {cartInfo && cartInfo.items && cartInfo.items.length ? (
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th className="text-center">Price</th>
                <th className="text-center">Total</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {cartInfo.items.map((item: TCart) => {
                return (
                  <CartItems
                    key={item.id}
                    cartItem={item}
                    handleItemRemove={handleItemRemove}
                    handleItemUpdate={handleItemUpdate}
                  />
                )
              })}

              <CartTotal {...cartInfo.prices} />
              <tr>
                <td> &nbsp; </td>
                <td> &nbsp; </td>
                <td> &nbsp; </td>
                <td>
                  <Link href="/">
                    <a className="btn btn-default">
                      <span className="glyphicon glyphicon-shopping-cart" />
                      Continue Shopping
                    </a>
                  </Link>
                </td>
                <td>
                  <Link href="/checkout/[step]" as="/checkout/shipping">
                    <motion.a
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="btn btn-success text-white"
                    >
                      Checkout <span className="glyphicon glyphicon-play" />
                    </motion.a>
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <motion.div
            initial={{ y: -250, opacity: 0 }}
            animate={{ y: -10, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center mt-5"
          >
            <h4>OOPS! YOUR CART IS EMPTY!!</h4>
            <Link href="/">
              <a>
                <strong>SHOP NOW</strong>
              </a>
            </Link>
          </motion.div>
        )}
      </FadeIn>
    </div>
  )
}

export default CartInfo
