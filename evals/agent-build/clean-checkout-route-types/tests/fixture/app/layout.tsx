import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Relay status',
  description: 'Marketing site, dashboard and docs for Relay.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
