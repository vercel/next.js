import { ReactNode } from 'react'

// Module-level timestamp — will change if this module is re-evaluated
export const rootLayoutEvaluatedAt = Date.now()

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <p id="root-layout-eval-time" style={{ display: 'none' }}>
          {rootLayoutEvaluatedAt}
        </p>
        {children}
      </body>
    </html>
  )
}
