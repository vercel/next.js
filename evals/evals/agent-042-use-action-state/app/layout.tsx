import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Product Search',
  description: 'Search our product catalog',
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
