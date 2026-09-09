import type { ReactNode } from 'react'

export const metadata = {
  title: 'Notes',
  description: 'A small notes workspace',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
