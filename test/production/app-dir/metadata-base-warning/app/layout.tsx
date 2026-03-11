import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'my title',
  description: 'my description',
  metadataBase: 'https://my-domain.com/',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
