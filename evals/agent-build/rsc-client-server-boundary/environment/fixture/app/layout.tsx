import Link from 'next/link'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Main navigation">
          <Link href="/">Home</Link>
          {' · '}
          <Link href="/teams">Teams</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
