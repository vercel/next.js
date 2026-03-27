import { ReactNode } from 'react'

// Module-level timestamp — will change if this module is re-evaluated
export const innerLayoutEvaluatedAt = Date.now()

export default function InnerLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p id="inner-layout-eval-time">{innerLayoutEvaluatedAt}</p>
      {children}
    </div>
  )
}
