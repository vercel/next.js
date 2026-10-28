import type { Metadata } from 'next'
import Link from 'next/link'
import { CartButton, CartProvider } from '@/components/cart'
import { Icon } from '@/components/icon'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Ridgeline Outfitters', template: '%s · Ridgeline' },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          <header className="header">
            <Link href="/">
              <Icon name="mountain" size={24} /> Ridgeline Outfitters
            </Link>
            <nav aria-label="Main">
              <Link href="/products">Shop</Link>
              <Link href="/about">About</Link>
              <CartButton icon={<Icon name="cart" />} />
            </nav>
          </header>
          {children}
        </CartProvider>
      </body>
    </html>
  )
}
