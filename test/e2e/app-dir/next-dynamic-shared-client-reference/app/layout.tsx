import type { ReactNode } from 'react'
import DynamicComponents from '../ui/dynamic-components'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <DynamicComponents />
        {children}
      </body>
    </html>
  )
}
