import type { ReactNode } from 'react'
import Link from 'next/link'
import './styles.css'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav aria-label="Main navigation">
          <ul>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/interactive-segment">Interactive Segment</Link>
            </li>
            <li>
              <Link href="/scrollable-segment">Scrollable Segment</Link>
            </li>
            <li>
              <Link href="/segment-with-focusable-descendant">
                Segment with focusable descendant
              </Link>
            </li>
            <li>
              <Link href="/uri-fragments#section-2">
                to URI fragment in different Segment
              </Link>
            </li>
            <li>
              <Link href="/uri-fragments">Segment with URI fragments</Link>
            </li>
          </ul>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
