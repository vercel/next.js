import type { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div id="compat-style-target" />
        {children}
      </body>
    </html>
  )
}
