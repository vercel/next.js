import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div id="root-layout">
          <h1>Root Layout</h1>
          {children}
        </div>
      </body>
    </html>
  )
}
