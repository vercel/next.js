import React from 'react'
import Link from 'next/link'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <div>
            <ul>
              <li>
                <Link id="go-to-index" href="/">
                  Index
                </Link>
              </li>
              <li>
                <Link id="go-to-dynamic" href="/dynamic/foo">
                  Dynamic page
                </Link>
              </li>
              <li>
                <Link id="go-to-404" href="/does-not-exist">
                  Not found page
                </Link>
              </li>
              <li>
                <Link id="go-to-dynamic-404" href="/dynamic/404">
                  Dynamic not found page
                </Link>
              </li>
            </ul>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
