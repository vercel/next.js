import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Theme Settings',
  description: 'Display user theme and language preferences',
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
