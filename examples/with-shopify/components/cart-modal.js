import Modal from 'react-modal'
import cn from 'classnames'
import { useCart, useCheckout } from '@/lib/cart'
import CartItem from './cart-item'
import styles from './cart-modal.module.css'

Modal.setAppElement('#__next')

export default function CartModal() {
  const { isOpen, closeCart } = useCart()
  const { checkout, setLineItems } = useCheckout()

  console.log('CHECKOUT', checkout)

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={closeCart}
      contentLabel="Example Modal"
      className={styles.modal}
      overlayClassName={styles.overlay}
    >
      <div className="bg-accent-2 px-8 py-4">
        <h3 className="text-2xl">Shopping Cart</h3>
      </div>

      <div className="p-8">
        {checkout ? (
          <form>
            <div>
              {checkout.lineItems.edges.map(({ node }) => (
                <CartItem
                  key={node.variant.id}
                  item={node}
                  setLineItems={setLineItems}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeCart}
              >
                Continue Shopping
              </button>
              <button type="submit" className={styles.submitButton}>
                Check Out
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-lg">Your cart is currently empty.</p>
            <div className="mt-8">
              <button
                type="button"
                className={cn(styles.submitButton, 'w-full')}
                onClick={closeCart}
              >
                Continue Shopping
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
