import Link from 'next/link'
import { TestControls } from './test-controls'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <ul>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/some-page" prefetch={true}>
              Some Page
            </Link>
          </li>
          <li>
            <Link href="/dashboard">Dashboard</Link>
          </li>
          <li>
            <Link href="/blog/hello">Blog post</Link>
          </li>
          <li>
            <Link href="/blog/hello?tag=react">Blog post with tag</Link>
          </li>
          <li>
            <Link href="/rewrite-source?q=from-user">Rewrite source</Link>
          </li>
          <li>
            {/* prefetch={false} so a click always issues the dynamic request
                that runs the page's 2s delay; see app/slow/page.tsx. */}
            <Link href="/slow" prefetch={false}>
              Slow page
            </Link>
          </li>
          <li>
            <Link href="/query?tab=stats">Query page with query</Link>
          </li>
          <li>
            <Link href="/end-marker" prefetch={true}>
              End marker page
            </Link>
          </li>
          <li>
            <Link href="/streaming">Streaming page</Link>
          </li>
        </ul>
        {/* Rendered in the layout so the buttons are available on every page
            (several lifecycle tests navigate first and then trigger a race
            from the destination page). */}
        <TestControls />
        {children}
      </body>
    </html>
  )
}
