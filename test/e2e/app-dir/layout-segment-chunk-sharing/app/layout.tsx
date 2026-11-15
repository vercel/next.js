import type { ReactNode } from 'react'
import { sharedLayoutValue } from './shared-layout-module'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <p id="root-layout">{sharedLayoutValue('root')}</p>
        {children}
      </body>
    </html>
  )
}
