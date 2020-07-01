import Modal from 'react-modal'
import Link from 'next/link'
import cn from 'classnames'
import { useCart, useCheckout } from '@/lib/cart'
import styles from './cart-modal.module.css'

Modal.setAppElement('#__next')

export default function CartModal() {
  const { isOpen, closeCart } = useCart()
  const { checkout } = useCheckout()

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
                <div key={node.variant.id}>
                  <div className="flex">
                    <Link href="/">
                      <a aria-label={node.variant.title} className="mr-2">
                        <img
                          src={
                            node.variant.image.transformedSrc ||
                            node.variant.image.originalSrc
                          }
                          alt={node.variant.image.altText}
                        />
                      </a>
                    </Link>

                    <div className="flex flex-col text-left justify-center">
                      <Link href="/">
                        <a aria-label={node.variant.title}>
                          <h3 className="text-lg hover:text-accent-5 font-medium mb-1">
                            {node.variant.title}
                          </h3>
                        </a>
                      </Link>
                      <p>Black</p>
                    </div>

                    <div className="flex flex-grow justify-center items-center">
                      <button
                        type="button"
                        className="w-10 h-10 border border-accent-2 hover:border-accent-7"
                      >
                        -
                      </button>
                      <input
                        className="w-12 h-10 bg-accent-2 border border-accent-2 text-center"
                        type="text"
                      />
                      <button
                        type="button"
                        className="w-10 h-10 border border-accent-2 hover:border-accent-7"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex flex-col text-right justify-center">
                      <span>$18.00</span>
                    </div>
                  </div>
                  <hr className="my-4" />
                </div>
              ))}
            </div>

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
