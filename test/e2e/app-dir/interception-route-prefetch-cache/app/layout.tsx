import Link from 'next/link'

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
