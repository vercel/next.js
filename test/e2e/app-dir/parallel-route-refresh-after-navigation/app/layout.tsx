import type { ReactNode } from 'react'

export default function Root({
  children,
  dialogs,
}: {
  children: ReactNode
  dialogs: ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {dialogs}
      </body>
    </html>
  )
}
