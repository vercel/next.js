import type { ReactNode } from 'react'

export default function Root({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {sidebar}
      </body>
    </html>
  )
}
