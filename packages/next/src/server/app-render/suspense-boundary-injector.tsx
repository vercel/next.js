import React from 'react'
import {
  getSuspenseBoundaries,
  type SuspenseBoundaryInfo,
} from './suspense-boundary-collector'

export interface SuspenseBoundaryData {
  boundaries: SuspenseBoundaryInfo[]
  timestamp: number
}

export function getSuspenseBoundaryData(): SuspenseBoundaryData {
  return {
    boundaries: getSuspenseBoundaries(),
    timestamp: Date.now(),
  }
}

export function SuspenseBoundaryScript(): React.ReactNode {
  const data = getSuspenseBoundaryData()

  // Only inject if there are boundaries to report
  // (boundaries are only collected when suspense profiling is enabled)
  if (data.boundaries.length === 0) {
    return null
  }

  return (
    <script
      id="__NEXT_SUSPENSE_BOUNDARIES__"
      type="application/json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  )
}

export function serializeSuspenseBoundaryScript(): string {
  const data = getSuspenseBoundaryData()

  if (data.boundaries.length === 0) {
    return ''
  }

  return `<script id="__NEXT_SUSPENSE_BOUNDARIES__" type="application/json">${JSON.stringify(data)}</script>`
}
