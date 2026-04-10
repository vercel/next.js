import Link from 'next/link'
import './layout.css'

export default function Root({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <nav>
          <ul>
            <li>
              <Link href="/page-1" prefetch={false}>
                Page 1
              </Link>
            </li>
            <li>
              <Link href="/page-2" prefetch={false}>
                Page 2
              </Link>
            </li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  )
}
