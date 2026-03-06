import { ReactNode } from 'react'
import { RouterAct } from '@next/router-act/component'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <RouterAct />
      </body>
    </html>
  )
}
