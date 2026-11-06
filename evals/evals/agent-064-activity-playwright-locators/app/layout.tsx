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
          <Link href="/billing">Billing</Link>{' '}
          <Link href="/profile">Profile</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
