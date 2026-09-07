import type { JSX, ReactNode } from 'react'

export default function Root({
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
