import type { ReactNode, JSX } from 'react'
export default function AppLayout({
  children,
}: {
  children: ReactNode
}): JSX.Element {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
