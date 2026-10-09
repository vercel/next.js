import Link from 'next/link'
import type { ReactNode } from 'react'

export const ensureStatic = 'navigation'

export default function LocaleLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav>
        <Link href="/en" prefetch={true}>
          home
        </Link>
        <Link href="/en/about" prefetch={true}>
          about
        </Link>
      </nav>
      {children}
    </div>
  )
}
