import type { ReactNode } from 'react'

export const metadata = {
  title: 'with-pompelmi-upload',
  description: 'Minimal Next.js upload scanning example with Pompelmi',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}