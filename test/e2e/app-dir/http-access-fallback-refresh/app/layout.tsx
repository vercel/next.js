import type { ReactNode } from 'react'
import { LayoutState } from './components/layout-state'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <LayoutState />
        {children}
      </body>
    </html>
  )
}
