import { ReactNode } from 'react'

// Captured at module evaluation time — used by tests to detect re-evaluation
export const outerLayoutEvaluatedAt = Date.now()

export default function OuterLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p id="outer-layout-eval-time">
        Outer Layout Evaluated At: {outerLayoutEvaluatedAt}
      </p>
      {children}
    </div>
  )
}
