import { ReactNode } from 'react'

// Note: it's important that the root layout is sync.
// If it's async, then it gets outlined and the root chunk
// manages to flush before the sync IO is triggered.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
