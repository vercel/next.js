import { ReactNode } from 'react'

// Root layout for the (standard) branch: all params in this branch are
// below the root layout, so none of them are root params.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
