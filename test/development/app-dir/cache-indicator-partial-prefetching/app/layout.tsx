import Link from 'next/link'
import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link href="/">/index</Link> |{' '}
          <ul>
            <li>
              <ul>
                <li>
                  <Link href="/params/prefetch-auto">
                    /params/prefetch-auto
                  </Link>
                </li>
                <li>
                  <Link href="/params/prefetch-true" prefetch={true}>
                    /params/prefetch-true (prefetch=true)
                  </Link>
                </li>
              </ul>
            </li>
            <li>
              <Link href="/cookies">/cookies</Link>
            </li>
            <li>
              <Link href="/private">/private</Link>
            </li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  )
}
