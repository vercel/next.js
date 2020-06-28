import Modal from 'react-modal'
import { useCart } from '@/lib/cart'
import styles from './cart-modal.module.css'

Modal.setAppElement('#__next')

export default function CartModal() {
  const { isOpen, closeCart } = useCart()

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={closeCart}
      contentLabel="Example Modal"
      className={styles.modal}
      overlayClassName={styles.overlay}
    >
      <div>
        <div className={styles.header}>
          <h2>Shopping Cart</h2>
          <span></span>
        </div>
        <form>
          <div className={styles.buttons}>
            <button type="button" className={styles.closeButton}>
              Continue Shopping
            </button>
            <button type="submit" className={styles.submitButton}>
              Check Out
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
