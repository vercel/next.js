import type { ReactNode } from 'react'
import { ActionProvider } from './action-context'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <ActionProvider>{children}</ActionProvider>
      </body>
    </html>
  )
}
