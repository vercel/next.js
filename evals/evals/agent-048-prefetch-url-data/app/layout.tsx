import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Product catalog',
  description: 'Browse products by category',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
