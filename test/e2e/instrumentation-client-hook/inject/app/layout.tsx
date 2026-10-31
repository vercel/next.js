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
            <Link href="/some-page">Some Page</Link>
          </li>
        </ul>
        {children}
      </body>
    </html>
  )
}
