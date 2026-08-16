import type { ReactNode } from 'react'

export default function Root({
  left,
  right,
}: {
  left: ReactNode
  right: ReactNode
}) {
  return (
    <html>
      <body>
        {left}
        {right}
      </body>
    </html>
  )
}
