import { type ReactNode, Suspense } from 'react'
import SharedComponent from './shared'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <SharedComponent layout="/" />
        <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
      </body>
    </html>
  )
}
