import type { ReactNode } from 'react'
import { Counter } from './counter'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <header>
          <Counter />
        </header>
        {children}
      </body>
    </html>
  )
}
