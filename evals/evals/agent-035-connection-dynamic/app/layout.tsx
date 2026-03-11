import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Random Number',
  description: 'Display a random number on each request',
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
