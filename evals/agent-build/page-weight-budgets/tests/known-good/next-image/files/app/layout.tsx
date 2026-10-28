import type { Metadata } from 'next'
import Link from 'next/link'
import { CartButton, CartProvider } from '@/components/cart'
import { Icon, IconProvider } from '@/components/icon'
import { StarDefs } from '@/components/stars'
import { icons } from '@/lib/icon-paths'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Ridgeline Outfitters', template: '%s · Ridgeline' },
}

// Every icon name passed to <Icon> must be listed here.
const usedIcons = Object.fromEntries(
  ['mountain', 'cart', 'heart', 'heart-filled'].map((name) => [
    name,
    icons[name],
  ])
)

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <StarDefs />
        <IconProvider icons={usedIcons}>
          <CartProvider>
            <header className="header">
              <Link href="/">
                <Icon name="mountain" size={24} /> Ridgeline Outfitters
              </Link>
              <nav aria-label="Main">
                <Link href="/products">Shop</Link>
                <Link href="/about">About</Link>
                <CartButton />
              </nav>
            </header>
            {children}
          </CartProvider>
        </IconProvider>
      </body>
    </html>
  )
}
