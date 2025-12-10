import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>Marketing Root: {children}</body>
    </html>
  )
}
