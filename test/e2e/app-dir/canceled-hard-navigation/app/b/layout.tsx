import type { ReactNode } from 'react'

export default function RootLayoutB({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
