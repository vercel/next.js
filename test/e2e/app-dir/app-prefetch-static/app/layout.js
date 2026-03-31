import Link from 'next/link'
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}

        <Link href="/se/static-prefetch" id="static-prefetch">
          Static Prefetch
        </Link>
        <Link href="/se/dynamic-area/slug" id="dynamic-prefetch">
          Dynamic Prefetch
        </Link>
      </body>
    </html>
  )
}
