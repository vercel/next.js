import type { ReactNode } from 'react'

export const metadata = {
  title: 'Acme Ops Dashboard',
  description: 'Internal operations dashboard for Acme',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
