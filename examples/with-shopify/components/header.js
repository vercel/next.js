import { useRouter } from 'next/router'
import Link from 'next/link'
import cn from 'classnames'
import { STORE_NAME } from '@/lib/constants'
import { useCart, useCheckout } from '@/lib/cart'
import styles from './header.module.css'

export default function Header({ title = STORE_NAME, pages }) {
  const { pathname } = useRouter()
  const { openCart } = useCart()
  const { checkout } = useCheckout()
  const itemsCount = checkout?.lineItems.edges.reduce(
    (count, { node }) => count + node.quantity,
    0
  )

  return (
    <header className="flex flex-col sm:flex-row justify-between items-center mb-20 mt-8">
      <h2 className="text-2xl md:text-4xl font-bold tracking-tight md:tracking-tighter leading-tight whitespace-no-wrap mb-5 sm:mb-0 sm:mr-8">
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

        {pages?.edges.map(({ node }) => (
          <Link
            key={node.handle}
            href="/pages/[page]"
            as={`/pages/${node.handle}`}
          >
            <a
              className={cn(styles.navItem, {
                'text-black': pathname === node.handle,
              })}
            >
              {node.title}
            </a>
          </Link>
        ))}

        <button type="button" className={styles.navItem} onClick={openCart}>
          🛒&nbsp;Cart {itemsCount ? `(${itemsCount})` : ''}
        </button>
      </nav>
    </header>
  )
}
