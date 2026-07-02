import Link from 'next/link'

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
        </ul>
        {children}
      </body>
    </html>
  )
}
