import type { ReactNode } from 'react'
import { DraftProvider } from './draft-provider'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <DraftProvider>{children}</DraftProvider>
      </body>
    </html>
  )
}
