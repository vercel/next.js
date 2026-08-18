import { ReactNode } from 'react'

export const metadata = {
  // The root layout provides a default title and a template. While a child
  // route's dynamic metadata is still streaming in, the title should fall back
  // to this default (or retain the previous route's title) — it must never be
  // dropped to an empty string (which makes the browser tab show the URL).
  title: { default: 'Home Default', template: '%s | Site' },
  metadataBase: new URL('https://example.com'),
  openGraph: {
    type: 'website',
    siteName: 'Site',
    title: 'Home Default',
    description: 'Layout open graph defaults',
    url: '/',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
