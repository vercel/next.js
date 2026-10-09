import type { ReactNode } from 'react'

export default function Root({
  children,
  parallel,
}: {
  children: ReactNode
  parallel: ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {parallel}
      </body>
    </html>
  )
}
