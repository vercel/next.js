'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

const CartContext = createContext(null)

export function CartProvider({ children, currency }) {
  const [lines, setLines] = useState([])
  const add = useCallback((product, sku) => {
    setLines((prev) => [...prev, { id: product.id, sku, price: product.price }])
  }, [])
  const value = useMemo(
    () => ({ lines, add, currency }),
    [lines, add, currency]
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  return useContext(CartContext)
}

export function CartButton({ label }) {
  const cart = useCart()
  const count = cart ? cart.lines.length : 0
  return (
    <button type="button" className="cart-button" aria-label={label}>
      <span aria-hidden="true">Cart</span>
      <span className="cart-count">{count}</span>
    </button>
  )
}

export function AddToCart({ product, sku, compact }) {
  const cart = useCart()
  const [added, setAdded] = useState(false)
  return (
    <button
      type="button"
      className={compact ? 'add-to-cart compact' : 'add-to-cart'}
      data-product={product.id}
      onClick={() => {
        cart?.add(product, sku)
        setAdded(true)
      }}
    >
      {added ? 'Added' : compact ? 'Add' : `Add ${product.name} to cart`}
    </button>
  )
}

// Links to the current page in every locale.
export function LocaleSwitcher({ locale, locales }) {
  const pathname = usePathname() || `/${locale}`
  const rest = pathname.split('/').slice(2).join('/')
  return (
    <ul className="locales" aria-label="Language">
      {locales.map((other) => (
        <li key={other}>
          <Link
            href={`/${other}${rest ? `/${rest}` : ''}`}
            hrefLang={other}
            aria-current={other === locale ? 'true' : undefined}
            prefetch={false}
          >
            {other.toUpperCase()}
          </Link>
        </li>
      ))}
    </ul>
  )
}

// The navigation again, for small screens. It gets the whole menu as props
// and renders the links when opened.
export function MobileMenu({ menu, label }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mobile-menu">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label} ({menu.length})
      </button>
      {open ? (
        <ul>
          {menu.map((group) => (
            <li key={group.title}>
              <span>{group.title}</span>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function SearchBox({ placeholder, categories }) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  return (
    <form className="search" role="search" action="/search">
      <select
        name="scope"
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        aria-label="Search in"
      >
        <option value="all">All</option>
        {categories.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.label}
          </option>
        ))}
      </select>
      <input
        type="search"
        name="q"
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="submit" disabled={query.length === 0}>
        Search
      </button>
    </form>
  )
}
