import { ReactNode } from 'react'
import { segmentUtilEvaluatedAt } from './segment-util'

export const _hmrTrigger = 0

// Captured at module evaluation time — used by tests to detect re-evaluation
export const innerLayoutEvaluatedAt = Date.now()

export default function InnerLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p id="inner-layout-eval-time">
        Inner Layout Evaluated At: {innerLayoutEvaluatedAt}
      </p>
      <p id="segment-util-eval-time">
        Segment Util Evaluated At: {segmentUtilEvaluatedAt}
      </p>
      {children}
    </div>
  )
}
