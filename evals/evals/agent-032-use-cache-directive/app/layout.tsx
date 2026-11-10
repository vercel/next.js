import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog Posts',
  description: 'A blog posts page with caching',
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
