import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>Dashboard Root: {children}</body>
    </html>
  )
}
