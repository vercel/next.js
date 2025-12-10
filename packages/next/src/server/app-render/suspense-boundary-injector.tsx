import React from 'react'
import {
  getSuspenseBoundaries,
  getDynamicAccesses,
  type SuspenseBoundaryInfo,
  type DynamicAPIAccess,
  type StackFrame,
} from './suspense-boundary-collector'

export type { SuspenseBoundaryInfo, DynamicAPIAccess, StackFrame }

export interface SuspenseBoundaryData {
  boundaries: SuspenseBoundaryInfo[]
  dynamicAccesses: DynamicAPIAccess[]
  timestamp: number
}

export function getSuspenseBoundaryData(): SuspenseBoundaryData {
  return {
    boundaries: getSuspenseBoundaries(),
    dynamicAccesses: getDynamicAccesses(),
    timestamp: Date.now(),
  }
}

export function SuspenseBoundaryScript(): React.ReactNode {
  const data = getSuspenseBoundaryData()

  // Only render if there's data to show
  if (data.boundaries.length === 0 && data.dynamicAccesses.length === 0) {
    return null
  }

  return (
    // eslint-disable-next-line  @next/internal/no-ambiguous-jsx
    <script
      id="__NEXT_SUSPENSE_BOUNDARIES__"
      type="application/json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  )
}
