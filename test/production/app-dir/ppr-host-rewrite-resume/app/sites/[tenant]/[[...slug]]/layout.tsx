import type { ReactNode } from 'react'

export const instant = false

export function generateStaticParams() {
  return [{ tenant: 'build.example', slug: [] }]
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
