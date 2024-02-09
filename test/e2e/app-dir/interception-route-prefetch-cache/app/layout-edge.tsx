// this file is swapped in for the normal layout file in the edge runtime test

import Link from 'next/link'

export const runtime = 'edge'

export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>
        <Link href="/">home</Link>
        {children}
      </body>
    </html>
  )
}
