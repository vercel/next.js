import Modal from 'react-modal'
import cn from 'classnames'
import { useCart } from '@/lib/cart'
import styles from './cart-modal.module.css'

Modal.setAppElement('#__next')

export default function CartModal() {
  const { checkout, isOpen, closeCart } = useCart()

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
        <p className="text-lg">Your cart is currently empty.</p>

        {checkout ? (
          <form>
            <div className="grid grid-cols-2 gap-4 mt-8">
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
          <div className="mt-8">
            <button
              type="button"
              className={cn(styles.submitButton, 'w-full')}
              onClick={closeCart}
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
