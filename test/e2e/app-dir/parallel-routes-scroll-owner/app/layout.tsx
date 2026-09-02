import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
