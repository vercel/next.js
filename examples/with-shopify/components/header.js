import { useRouter } from 'next/router'
import Link from 'next/link'
import cn from 'classnames'
import { useCart, useCheckout } from '@/lib/cart'
import styles from './header.module.css'

export default function Header({ title }) {
  const { pathname } = useRouter()
  const { openCart } = useCart()
  const { checkout } = useCheckout()
  const itemsCount = checkout?.lineItems.edges.reduce(
    (count, { node }) => count + node.quantity,
    0
  )

  return (
    <header className={styles.header}>
      <h2 className={styles.logo}>
        <Link href="/">
          <a className="hover:underline">{title}</a>
        </Link>
      </h2>
      <nav className="flex items-center">
        <Link href="/">
          <a
            className={cn(styles.navItem, {
              [styles.active]: pathname === '/',
            })}
          >
            Home
          </a>
        </Link>
        <a href="#" className={styles.navItem}>
          About
        </a>
        <button type="button" className={styles.navItem} onClick={openCart}>
          🛒 Cart {itemsCount ? `(${itemsCount})` : ''}
        </button>
      </nav>
    </header>
  )
}
