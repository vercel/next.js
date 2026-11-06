import Link from 'next/link'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/contact">Contact</Link> <Link href="/about">About</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
