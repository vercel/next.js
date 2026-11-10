import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Welcome Page',
  description: 'A page with analytics logging',
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
