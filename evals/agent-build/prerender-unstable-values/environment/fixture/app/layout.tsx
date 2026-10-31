import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/components/footer'

export const metadata: Metadata = {
  title: 'Pulse',
  description: 'Uptime monitoring and incident communication.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav aria-label="Main">
            <Link href="/">Pulse</Link>
            {' · '}
            <Link href="/status">Status</Link>
            {' · '}
            <Link href="/account">Account</Link>
          </nav>
        </header>
        {children}
        <Footer />
      </body>
    </html>
  )
}
