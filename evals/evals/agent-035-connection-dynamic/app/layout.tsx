import type { ReactNode } from 'react'
import { RequestMetadata } from '@/components/request-metadata'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>Operations</nav>
        <RequestMetadata />
        {children}
      </body>
    </html>
  )
}
