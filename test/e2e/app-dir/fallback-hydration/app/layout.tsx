import type { ReactNode } from 'react'
import { ErrorTrigger } from './error-trigger'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <ErrorTrigger>{children}</ErrorTrigger>
      </body>
    </html>
  )
}
