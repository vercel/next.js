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
    >
      <div>
        <h2>Cart Modal</h2>
        <p>Hello there!</p>
      </div>
    </Modal>
  )
}
