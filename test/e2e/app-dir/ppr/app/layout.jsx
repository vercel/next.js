import React from 'react'
import Link from 'next/link'

const links = [
  { href: '/' },
  { href: '/no-suspense' },
  { href: '/suspense/node' },
  { href: '/suspense/edge' },
  { href: '/suspense/node/nested/1' },
  { href: '/loading/nested/1' },
  { href: '/loading/nested/2' },
  { href: '/loading/nested/3' },
]

export default function Root({ children }) {
  return (
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
      </head>
      <body>
        <main className="prose my-6 mx-auto">
          <h1 id="page">Page</h1>
          {children}
          <h2>Links</h2>
          <ul>
            {links.map(({ href }) => (
              <li key={href}>
                {href} - <Link href={href}>link</Link> -{' '}
                <a href={href}>anchor</a>
              </li>
            ))}
          </ul>
        </main>
      </body>
    </html>
  )
}
