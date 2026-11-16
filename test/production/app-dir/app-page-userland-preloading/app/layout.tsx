import type { ReactNode } from 'react'

console.log('page-preload:layout-loaded')

export default function Root({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {slot}
      </body>
    </html>
  )
}
