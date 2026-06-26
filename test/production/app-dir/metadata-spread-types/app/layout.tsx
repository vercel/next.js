import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Layout title',
  description: 'Layout description',
  openGraph: {
    title: 'Layout OG title',
    description: 'Layout OG description',
    url: 'https://example.com',
    siteName: 'Example Site',
  },
  twitter: {
    card: 'summary',
    title: 'Layout Twitter title',
    description: 'Layout Twitter description',
    site: '@example',
    creator: '@creator',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
