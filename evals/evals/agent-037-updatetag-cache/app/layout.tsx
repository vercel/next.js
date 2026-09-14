import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Posts',
  description: 'Create and view posts',
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
