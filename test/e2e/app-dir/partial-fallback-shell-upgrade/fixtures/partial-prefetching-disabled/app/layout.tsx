import type { ReactNode } from 'react'

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
