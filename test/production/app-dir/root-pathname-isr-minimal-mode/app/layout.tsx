import { ReactNode } from 'react'
import { Pathname } from './pathname'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Pathname />
        {children}
      </body>
    </html>
  )
}
