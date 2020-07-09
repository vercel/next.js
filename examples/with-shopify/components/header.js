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
      <nav className="w-full flex-grow grid grid-cols-header gap-4 justify-center sm:justify-end items-center">
        <Link href="/">
          <a
            className={cn(styles.navItem, {
              'text-black': pathname === '/',
            })}
          >
            Home
          </a>
        </Link>
        <a href="#" className={styles.navItem}>
          About
        </a>
        <button type="button" className={styles.navItem} onClick={openCart}>
          🛒&nbsp;Cart {itemsCount ? `(${itemsCount})` : ''}
        </button>
      </nav>
    </header>
  )
}
