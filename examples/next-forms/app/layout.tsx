import './global.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Next.js Forms Example',
  description: 'Example application with forms and Postgres.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
