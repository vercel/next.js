import { NextScript } from 'next/document'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <NextScript />
      <body>{children}</body>
    </html>
  )
}
