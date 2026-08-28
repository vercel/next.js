import type { ReactNode } from 'react'
import { Suspense } from 'react'
import Link from 'next/link'
import { loadSession } from '@/lib/session'

export const metadata = { title: 'Meterboard' }

async function AccountBadge() {
  const session = await loadSession()
  return <span data-testid="account-badge">{session.userId}</span>
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Home</Link> <Link href="/overview">Overview</Link>{' '}
          <Link href="/billing">Billing</Link>{' '}
          <Suspense fallback={<span />}>
            <AccountBadge />
          </Suspense>
        </nav>
        {children}
      </body>
    </html>
  )
}
