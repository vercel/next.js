import Link from 'next/link'

export const metadata = {
  title: 'Recipe Box Kitchen',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Recipe Box</Link>{' '}
          <Link href="/orders">Meal Orders</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
